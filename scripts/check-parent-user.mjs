import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const run = async () => {
  const u = await s.from('cbl_users').select('id,phone,password,role,name,account_name,client_id,status,created_at').eq('role', 'parent');
  console.log('PARENT USERS:', JSON.stringify(u.data, null, 1));

  const p = await s.from('cbl_parents').select('id,name,phone');
  console.log('ALL PARENTS:', JSON.stringify(p.data));

  const st = await s.from('cbl_students').select('id,name,student_id,parent_ids,primary_parent_id,client_id');
  console.log('STUDENTS:', JSON.stringify(st.data, null, 1));
};
run();
