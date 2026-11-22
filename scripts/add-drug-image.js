'use strict';
/**
 * Upload drug pack images to Kemist.
 *
 * Usage:
 *   npm run images:add -- --nrn A4-7559 --file ./pack.jpg --kind pack --licence owner-supplied --by manufacturer --credit "Emzor"
 *   npm run images:add -- --folder ./images                          # each file named <NRN>.jpg (e.g. A4-7559.jpg)
 *
 * If several records share the NRN, add --id <drug uuid> to pick one.
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { nrnKey } = require('../src/lib/helpers');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env'); process.exitCode = 1; process.exit(); }
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const BUCKET = 'drug-images';
const MAX_SIZE = 3 * 1024 * 1024; // 3 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAGIC = {
  jpeg: [0xFF, 0xD8, 0xFF],
  png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF (need to check WEBP at offset 8)
};

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opts = (n) => args.flatMap((a, i) => (a === `--${n}` && args[i + 1] ? [args[i + 1]] : []));
const opt = (n, d = null) => opts(n)[0] ?? d;

function detectExt(buf) {
  if (buf[0] === MAGIC.jpeg[0] && buf[1] === MAGIC.jpeg[1] && buf[2] === MAGIC.jpeg[2]) return 'jpg';
  if (buf[0] === MAGIC.png[0] && buf[1] === MAGIC.png[1] && buf[2] === MAGIC.png[2] && buf[3] === MAGIC.png[3] && buf[4] === MAGIC.png[4] && buf[5] === MAGIC.png[5] && buf[6] === MAGIC.png[6] && buf[7] === MAGIC.png[7]) return 'png';
  if (buf[0] === MAGIC.webp[0] && buf[1] === MAGIC.webp[1] && buf[2] === MAGIC.webp[2] && buf[3] === MAGIC.webp[3] && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
  return null;
}

async function uploadOne(filePath, drugId, kind, licence, by, credit) {
  const buf = fs.readFileSync(filePath);
  if (buf.length > MAX_SIZE) throw new Error(`File too large: ${buf.length} bytes (max ${MAX_SIZE})`);
  const ext = detectExt(buf);
  if (!ext) throw new Error('Unsupported file type (only JPEG, PNG, WebP)');
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  if (!ALLOWED_MIME.includes(mime)) throw new Error(`MIME not allowed: ${mime}`);

  const storagePath = `${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await db.storage.from(BUCKET).upload(storagePath, buf, { contentType: mime, upsert: false });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const { error: insErr } = await db.from('drug_images').insert({
    drug_id: drugId,
    storage_path: storagePath,
    kind,
    licence,
    uploaded_by: by,
    credit,
    status: 'approved',
  });
  if (insErr) {
    await db.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`DB insert failed: ${insErr.message}`);
  }
  const { data } = db.storage.from(BUCKET).getPublicUrl(storagePath);
  console.log(`  ✓ Uploaded ${path.basename(filePath)} -> ${data.publicUrl}`);
  return data.publicUrl;
}

async function findDrugByNrn(nrn, explicitId) {
  const key = nrnKey(nrn);
  const { data: rows, error } = await db.from('drugs').select('id, name, nrn').eq('nrn_key', key);
  if (error) throw new Error(`findByNrn: ${error.message}`);
  if (!rows.length) throw new Error(`No drug found with NRN ${nrn}`);
  if (rows.length > 1 && !explicitId) {
    console.error(`Multiple drugs share NRN ${nrn}:`);
    rows.forEach(r => console.error(`  ${r.id}  ${r.name}  (NRN: ${r.nrn})`));
    throw new Error('Use --id <uuid> to pick one');
  }
  if (explicitId) {
    const match = rows.find(r => r.id === explicitId);
    if (!match) throw new Error(`No drug with id ${explicitId} for NRN ${nrn}`);
    return match;
  }
  return rows[0];
}

async function main() {
  const folder = opt('folder');
  const nrn = opt('nrn');
  const file = opt('file');
  const id = opt('id');
  const kind = opt('kind', 'pack');
  const licence = opt('licence', 'owner-supplied');
  const by = opt('by', 'owner');
  const credit = opt('credit', '');

  if (folder) {
    if (!fs.existsSync(folder)) { console.error(`Folder not found: ${folder}`); process.exitCode = 1; return; }
    const files = fs.readdirSync(folder).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
    if (!files.length) { console.error('No image files found in folder'); process.exitCode = 1; return; }
    console.log(`Found ${files.length} image(s) in ${folder}`);
    let ok = 0, fail = 0;
    for (const f of files) {
      const nrnFromFile = path.parse(f).name;
      try {
        const drug = await findDrugByNrn(nrnFromFile);
        await uploadOne(path.join(folder, f), drug.id, kind, licence, by, credit || drug.name);
        ok++;
      } catch (e) {
        console.error(`  ✗ ${f}: ${e.message}`);
        fail++;
      }
    }
    console.log(`\nDone. Uploaded: ${ok}. Failed: ${fail}.`);
    return;
  }

  if (!nrn || !file) { console.error('Usage: --nrn <NRN> --file <path> [--kind pack|front|back|blister|label] [--licence owner-supplied] [--by owner|manufacturer|pharmacy|user] [--credit "text"] [--id <uuid>]'); process.exitCode = 1; return; }
  if (!fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exitCode = 1; return; }

  try {
    const drug = await findDrugByNrn(nrn, id);
    console.log(`Drug: ${drug.name} (${drug.nrn})`);
    await uploadOne(file, drug.id, kind, licence, by, credit);
    console.log('Done.');
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exitCode = 1; });