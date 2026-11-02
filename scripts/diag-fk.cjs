// 一次性診斷腳本: 透過 PostgREST OpenAPI 讀 live schema
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envText = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const res = await fetch(`${URL}/rest/v1/`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/openapi+json' },
  });
  const spec = await res.json();
  const defs = spec.definitions || spec.components?.schemas || {};
  const names = Object.keys(defs).sort();
  console.log('=== tables visible via PostgREST ===');
  console.log(names.join('\n'));

  console.log('\n=== columns of user-ish tables ===');
  for (const t of names.filter((n) => /user|parent|child|student/i.test(n))) {
    const props = defs[t].properties || {};
    const req = defs[t].required || [];
    console.log(`\n-- ${t} --`);
    for (const [k, v] of Object.entries(props)) {
      const fmt = v.format ? ` (${v.format})` : '';
      const rel = v['x-foreign-key'] ? `  <FK: ${JSON.stringify(v['x-foreign-key'])}>` : '';
      console.log(`   ${k}: ${(v.type || '?')}${fmt}${req.includes(k) ? ' NOT NULL' : ''}${rel}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
