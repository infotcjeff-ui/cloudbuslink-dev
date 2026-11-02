import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const run = async () => {
  const users = (await supabase.from('cbl_users').select('id,phone,account_name,name,role,client_id,status')).data || [];
  const parents = (await supabase.from('cbl_parents').select('id,client_id,name,phone,account_name,status')).data || [];
  const students = (await supabase.from('cbl_students').select('id,client_id,name,student_id,parent_ids,primary_parent_id,bus_id')).data || [];
  const clients = (await supabase.from('cbl_clients').select('id,name')).data || [];

  console.log('CLIENTS', JSON.stringify(clients));
  console.log('USERS', JSON.stringify(users, null, 1));
  console.log('PARENTS', JSON.stringify(parents, null, 1));
  console.log('STUDENTS', JSON.stringify(students, null, 1));
};
run();
