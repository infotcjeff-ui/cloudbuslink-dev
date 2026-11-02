import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = env.SUPABASE_SERVICE_ROLE_KEY;

const run = async () => {
  const a = createClient(url, anon, { auth: { persistSession: false } });
  const s = createClient(url, svc, { auth: { persistSession: false } });

  for (const [label, c] of [['ANON', a], ['SVC', s]]) {
    const p = await c.from('cbl_parents').select('id,client_id,name,phone,password,status');
    const st = await c.from('cbl_students').select('id,name,parent_ids,primary_parent_id,client_id');
    const u = await c.from('cbl_users').select('id,phone,name,role,client_id');
    console.log(`--- ${label}`);
    console.log('  parents:', JSON.stringify(p.data), p.error?.message || '');
    console.log('  students:', JSON.stringify(st.data), st.error?.message || '');
    console.log('  users:', JSON.stringify(u.data), u.error?.message || '');
  }
};
run();
