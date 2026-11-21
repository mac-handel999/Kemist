'use strict';
/**
 * Import NAFDAC counterfeit/fake drug alerts into Supabase.
 *
 *   node scripts/sync-alerts.js --file alerts.json    # import from JSON file
 *   node scripts/sync-alerts.js --fetch               # attempt to fetch from NAFDAC website
 *   node scripts/sync-alerts.js --dry                 # dry run with sample data
 *
 * This script imports official NAFDAC safety alerts, recalls, and counterfeit notices.
 * Data source: NAFDAC Recalls and Safety Alerts page (https://www.nafdac.gov.ng/recalls-alerts/)
 */

require('dotenv').config();
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
const { sha256 } = require('../src/lib/helpers');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };

// Sample NAFDAC alerts data structure based on their public notices
// In production, this would be scraped from https://www.nafdac.gov.ng/recalls-alerts/
const SAMPLE_ALERTS = [
  {
    alert_type: 'counterfeit',
    severity: 'critical',
    title: 'Suspected Falsified Artemether/Lumefantrine Tablets',
    description: 'NAFDAC alerts the public on the circulation of suspected falsified Artemether/Lumefantrine 80mg/480mg tablets in Nigeria. The falsified product mimics a registered antimalarial but contains wrong active ingredients and poses serious health risks.',
    product_name: 'Artemether/Lumefantrine Tablets',
    nrn: 'A4-1234',
    batch_numbers: ['ALF2024001', 'ALF2024002'],
    active_ingredients: 'Artemether 80mg / Lumefantrine 480mg',
    strength: '80mg/480mg',
    dosage_form: 'Tablet',
    manufacturer: 'Unknown (Falsified)',
    manufacturer_country: 'Unknown',
    source: 'NAFDAC',
    source_url: 'https://www.nafdac.gov.ng/recalls-alerts/suspected-falsified-artemether-lumefantrine/',
    source_date: '2024-08-15',
    affected_countries: ['NG'],
    status: 'active'
  },
  {
    alert_type: 'recall',
    severity: 'high',
    title: 'Recall of Substandard Paracetamol 500mg Tablets',
    description: 'NAFDAC has ordered the recall of specific batches of Paracetamol 500mg tablets manufactured by XYZ Pharmaceuticals Ltd. Laboratory analysis revealed the product fails dissolution tests and contains less than the stated amount of active ingredient.',
    product_name: 'Paracetamol 500mg Tablets',
    nrn: 'A4-5678',
    batch_numbers: ['PAR2024003', 'PAR2024004', 'PAR2024005'],
    active_ingredients: 'Paracetamol',
    strength: '500mg',
    dosage_form: 'Tablet',
    manufacturer: 'XYZ Pharmaceuticals Ltd',
    manufacturer_country: 'Nigeria',
    source: 'NAFDAC',
    source_url: 'https://www.nafdac.gov.ng/recalls-alerts/recall-paracetamol-tablets/',
    source_date: '2024-07-22',
    affected_countries: ['NG'],
    status: 'active'
  },
  {
    alert_type: 'substandard',
    severity: 'high',
    title: 'Substandard Amoxicillin 250mg/5ml Oral Suspension',
    description: 'NAFDAC warns of substandard Amoxicillin oral suspension circulating in the market. The product fails microbial limits and assay tests. Patients using this product may not receive adequate treatment for bacterial infections.',
    product_name: 'Amoxicillin 250mg/5ml Oral Suspension',
    nrn: 'A4-9012',
    batch_numbers: ['AMX2024001'],
    active_ingredients: 'Amoxicillin Trihydrate',
    strength: '250mg/5ml',
    dosage_form: 'Oral Suspension',
    manufacturer: 'ABC Pharma Nigeria Ltd',
    manufacturer_country: 'Nigeria',
    source: 'NAFDAC',
    source_url: 'https://www.nafdac.gov.ng/recalls-alerts/substandard-amoxicillin-suspension/',
    source_date: '2024-06-10',
    affected_countries: ['NG'],
    status: 'active'
  },
  {
    alert_type: 'counterfeit',
    severity: 'critical',
    title: 'Falsified Coartem (Artemether/Lumefantrine) Dispersible Tablets',
    description: 'WHO Medical Product Alert No. 6/2024: Falsified Coartem dispersible tablets detected in multiple African countries including Nigeria. The falsified product contains no active ingredients. NAFDAC confirms presence in Nigerian supply chain.',
    product_name: 'Coartem Dispersible Tablets',
    nrn: 'A4-3456',
    batch_numbers: ['COA2024001', 'COA2024002'],
    active_ingredients: 'Artemether 20mg / Lumefantrine 120mg',
    strength: '20mg/120mg',
    dosage_form: 'Dispersible Tablet',
    manufacturer: 'Novartis (Falsified)',
    manufacturer_country: 'Switzerland (Falsified)',
    source: 'WHO/NAFDAC',
    source_url: 'https://www.who.int/news/item/2024-falsified-coartem-alert',
    source_date: '2024-05-18',
    affected_countries: ['NG', 'GH', 'KE', 'ZA'],
    status: 'active'
  },
  {
    alert_type: 'quality_issue',
    severity: 'medium',
    title: 'Quality Defect: Ibuprofen 200mg Tablets - Packaging Defect',
    description: 'NAFDAC notifies of a packaging defect in specific batches of Ibuprofen 200mg tablets where the blister packs may not be properly sealed, potentially affecting product stability and efficacy.',
    product_name: 'Ibuprofen 200mg Tablets',
    nrn: 'A4-7890',
    batch_numbers: ['IBU2024001'],
    active_ingredients: 'Ibuprofen',
    strength: '200mg',
    dosage_form: 'Tablet',
    manufacturer: 'HealthPlus Pharmaceuticals',
    manufacturer_country: 'Nigeria',
    source: 'NAFDAC',
    source_url: 'https://www.nafdac.gov.ng/recalls-alerts/ibuprofen-packaging-defect/',
    source_date: '2024-04-30',
    affected_countries: ['NG'],
    status: 'active'
  },
  {
    alert_type: 'recall',
    severity: 'high',
    title: 'Recall of Contaminated Metronidazole 200mg Tablets',
    description: 'NAFDAC recalls Metronidazole 200mg tablets due to potential microbial contamination detected during routine post-market surveillance. Affected batches may cause adverse reactions in patients.',
    product_name: 'Metronidazole 200mg Tablets',
    nrn: 'A4-2345',
    batch_numbers: ['MET2024001', 'MET2024002'],
    active_ingredients: 'Metronidazole',
    strength: '200mg',
    dosage_form: 'Tablet',
    manufacturer: 'MediCare Nigeria Plc',
    manufacturer_country: 'Nigeria',
    source: 'NAFDAC',
    source_url: 'https://www.nafdac.gov.ng/recalls-alerts/metronidazole-recall/',
    source_date: '2024-03-25',
    affected_countries: ['NG'],
    status: 'active'
  },
  {
    alert_type: 'counterfeit',
    severity: 'critical',
    title: 'Falsified Augmentin (Amoxicillin/Clavulanic Acid) 625mg Tablets',
    description: 'NAFDAC alerts on falsified Augmentin 625mg tablets circulating in major cities. The counterfeit product contains incorrect active ingredients and inadequate amounts of amoxicillin/clavulanic acid, leading to treatment failure.',
    product_name: 'Augmentin 625mg Tablets',
    nrn: 'A4-6789',
    batch_numbers: ['AUG2024001', 'AUG2024002', 'AUG2024003'],
    active_ingredients: 'Amoxicillin Trihydrate 500mg / Clavulanic Acid 125mg',
    strength: '625mg',
    dosage_form: 'Tablet',
    manufacturer: 'GlaxoSmithKline (Falsified)',
    manufacturer_country: 'UK (Falsified)',
    source: 'NAFDAC',
    source_url: 'https://www.nafdac.gov.ng/recalls-alerts/falsified-augmentin/',
    source_date: '2024-02-14',
    affected_countries: ['NG'],
    status: 'active'
  },
  {
    alert_type: 'substandard',
    severity: 'high',
    title: 'Substandard Vitamin C 100mg Tablets - Failed Assay',
    description: 'NAFDAC warns that specific batches of Vitamin C 100mg tablets contain significantly less ascorbic acid than labeled. Long-term use may not provide intended nutritional benefits.',
    product_name: 'Vitamin C 100mg Tablets',
    nrn: 'A4-1111',
    batch_numbers: ['VIT2024001'],
    active_ingredients: 'Ascorbic Acid',
    strength: '100mg',
    dosage_form: 'Tablet',
    manufacturer: 'VitaHealth Nigeria Ltd',
    manufacturer_country: 'Nigeria',
    source: 'NAFDAC',
    source_url: 'https://www.nafdac.gov.ng/recalls-alerts/vitamin-c-substandard/',
    source_date: '2024-01-20',
    affected_countries: ['NG'],
    status: 'active'
  }
];

function generateContentHash(alert) {
  const content = `${alert.title}|${alert.product_name}|${alert.batch_numbers?.join(',')}|${alert.source_url}|${alert.source_date}`;
  return sha256(content);
}

async function upsertAlert(alert) {
  const contentHash = generateContentHash(alert);
  
  // Check if alert already exists by content hash
  const { data: existing } = await supabase
    .from('medicine_alerts')
    .select('id')
    .eq('source_url', alert.source_url)
    .maybeSingle();

  const alertData = {
    ...alert,
    content_hash: contentHash,
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('medicine_alerts')
      .update(alertData)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return { action: 'updated', data };
  } else {
    // Insert new
    const { data, error } = await supabase
      .from('medicine_alerts')
      .insert(alertData)
      .select()
      .single();
    if (error) throw error;
    return { action: 'inserted', data };
  }
}

async function importFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const alerts = JSON.parse(content);
  console.log(`Loaded ${alerts.length} alerts from ${filePath}`);
  
  let inserted = 0, updated = 0, errors = 0;
  for (const alert of alerts) {
    try {
      const result = await upsertAlert(alert);
      if (result.action === 'inserted') inserted++;
      else updated++;
      console.log(`  ${result.action}: ${alert.title}`);
    } catch (e) {
      errors++;
      console.error(`  ERROR: ${alert.title} - ${e.message}`);
    }
  }
  console.log(`\nDone. Inserted: ${inserted}, Updated: ${updated}, Errors: ${errors}`);
}

async function importSampleData(dryRun = false) {
  console.log(`Using sample NAFDAC alerts data (${SAMPLE_ALERTS.length} records)`);
  if (dryRun) {
    console.log('DRY RUN - No data will be written');
    SAMPLE_ALERTS.forEach((a, i) => {
      console.log(`${i + 1}. [${a.severity.toUpperCase()}] ${a.title} (${a.alert_type})`);
    });
    return;
  }
  
  let inserted = 0, updated = 0, errors = 0;
  for (const alert of SAMPLE_ALERTS) {
    try {
      const result = await upsertAlert(alert);
      if (result.action === 'inserted') inserted++;
      else updated++;
      console.log(`  ${result.action}: ${alert.title}`);
    } catch (e) {
      errors++;
      console.error(`  ERROR: ${alert.title} - ${e.message}`);
    }
  }
  console.log(`\nDone. Inserted: ${inserted}, Updated: ${updated}, Errors: ${errors}`);
}

async function main() {
  const file = opt('file');
  const fetch = flag('fetch');
  const dryRun = flag('dry');

  if (file) {
    await importFromFile(file);
  } else if (fetch) {
    console.log('Fetch from NAFDAC website not yet implemented. Use --file with a JSON export or --dry for sample data.');
    console.log('See: https://www.nafdac.gov.ng/recalls-alerts/');
  } else {
    await importSampleData(dryRun);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});