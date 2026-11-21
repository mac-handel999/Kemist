'use strict';
/**
 * CLI for managing API credentials.
 * 
 *   node scripts/manage-api-keys.js --add --provider apify --label "Primary" --key "xxx"
 *   node scripts/manage-api-keys.js --list --provider apify
 *   node scripts/manage-api-keys.js --enable --id <credential-id>
 *   node scripts/manage-api-keys.js --disable --id <credential-id>
 *   node scripts/manage-api-keys.js --delete --id <credential-id>
 *   node scripts/manage-api-keys.js --logs --id <credential-id>
 *   node scripts/manage-api-keys.js --reset-monthly
 */
require('dotenv').config();
const apiKeys = require('../src/lib/api-keys');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

async function main() {
  try {
    if (flag('add')) {
      const provider = opt('provider');
      const label = opt('label');
      const key = opt('key');
      if (!provider || !label || !key) {
        console.error('Usage: --add --provider <apify|serpapi|openfda|geoapify> --label <name> --key <api-key>');
        process.exitCode = 1;
        return;
      }
      const cred = await apiKeys.addCredential(provider, label, key, {
        monthlyLimit: opt('monthly-limit') ? Number(opt('monthly-limit')) : null,
        isActive: !flag('inactive')
      });
      console.log(`Added credential: ${cred.id} (${cred.provider}/${cred.label})`);
      return;
    }

    if (flag('list')) {
      const provider = opt('provider');
      const creds = await apiKeys.listCredentials(provider);
      if (!creds.length) {
        console.log('No credentials found.');
        return;
      }
      console.log('ID                                    | Provider | Label       | Active | Used | Errors | Cooldown Until');
      console.log('--------------------------------------------------------------------------------');
      for (const c of creds) {
        const cooldown = c.cooldown_until ? new Date(c.cooldown_until).toISOString() : '-';
        console.log(`${c.id} | ${c.provider.padEnd(8)} | ${c.label.padEnd(11)} | ${String(c.is_active).padEnd(6)} | ${String(c.usage_count || 0).padEnd(4)} | ${String(c.error_count || 0).padEnd(6)} | ${cooldown}`);
      }
      return;
    }

    if (flag('enable') || flag('disable')) {
      const id = opt('id');
      if (!id) { console.error('Usage: --enable|--disable --id <credential-id>'); process.exitCode = 1; return; }
      await apiKeys.setCredentialActive(id, flag('enable'));
      console.log(`Credential ${id} ${flag('enable') ? 'enabled' : 'disabled'}.`);
      return;
    }

    if (flag('delete')) {
      const id = opt('id');
      if (!id) { console.error('Usage: --delete --id <credential-id>'); process.exitCode = 1; return; }
      await apiKeys.deleteCredential(id);
      console.log(`Credential ${id} deleted.`);
      return;
    }

    if (flag('logs')) {
      const id = opt('id');
      const limit = Number(opt('limit', 20));
      if (!id) { console.error('Usage: --logs --id <credential-id> [--limit 20]'); process.exitCode = 1; return; }
      const logs = await apiKeys.getCallLogs(id, limit);
      if (!logs.length) {
        console.log('No logs found.');
        return;
      }
      console.log('Time                 | Success | Status | Latency | Error');
      console.log('--------------------------------------------------------------------------------');
      for (const l of logs) {
        const time = new Date(l.created_at).toISOString();
        const status = l.success ? 'OK' : 'FAIL';
        console.log(`${time} | ${String(l.success).padEnd(7)} | ${String(l.status_code || '-').padEnd(6)} | ${String(l.latency_ms || '-').padEnd(7)} | ${l.error_message || '-'}`);
      }
      return;
    }

    if (flag('reset-monthly')) {
      const count = await apiKeys.resetMonthlyUsage();
      console.log(`Reset monthly usage for ${count} credentials.`);
      return;
    }

    console.log(`
API Key Manager CLI

Usage:
  --add --provider <apify|serpapi|openfda|geoapify> --label <name> --key <api-key> [--monthly-limit N] [--inactive]
  --list [--provider <name>]
  --enable --id <credential-id>
  --disable --id <credential-id>
  --delete --id <credential-id>
  --logs --id <credential-id> [--limit 20]
  --reset-monthly

Examples:
  node scripts/manage-api-keys.js --add --provider apify --label "Primary" --key "apify_xxx"
  node scripts/manage-api-keys.js --add --provider serpapi --label "Backup" --key "xxx" --monthly-limit 240
  node scripts/manage-api-keys.js --list --provider serpapi
  node scripts/manage-api-keys.js --logs --id <uuid> --limit 50
`);
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  }
}

main();