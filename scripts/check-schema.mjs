import fs from 'fs';

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const run = async () => {
  const res = await fetch(`${url}/rest/v1/`, { headers });
  const json = await res.json();
  for (const t of ['cbl_parents', 'cbl_students', 'cbl_users']) {
    const def = json.definitions?.[t];
    if (!def) { console.log(t, 'NOT FOUND'); continue; }
    console.log('===', t, '| required:', JSON.stringify(def.required));
    for (const [k, v] of Object.entries(def.properties)) {
      console.log('   ', k, '|', v.type, v.format === 'array' ? `(array of ${v.items?.type})` : '', v.default !== undefined ? `default=${v.default}` : '');
    }
  }
};
run();
