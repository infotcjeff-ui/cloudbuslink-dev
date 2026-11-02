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

const row = {
  id: 'test-parent-' + Date.now(),
  client_id: 'client-mvqc4fl6-sg95a',
  name: '測試家長',
  phone: '90000099',
  relationship: 'father',
  is_pickup_auth: true,
  password: 'test1234',
  notification_enabled: true,
  status: 'active',
  created_at: new Date().toISOString(),
};

const run = async () => {
  const a = createClient(url, anon, { auth: { persistSession: false } });
  const r1 = await a.from('cbl_parents').insert(row).select();
  console.log('ANON insert =>', JSON.stringify(r1.error || r1.data));

  const s = createClient(url, svc, { auth: { persistSession: false } });
  const r2 = await s.from('cbl_parents').insert({ ...row, id: row.id + '-svc' }).select();
  console.log('SVC insert =>', JSON.stringify(r2.error || r2.data));

  // 檢查 RLS policies (用 service role 查不到 policy, 改用 pg via rpc 試)
  const { data: policies, error: perr } = await s.rpc('query_policies', {});
  console.log('policies rpc =>', perr?.message || JSON.stringify(policies));

  // 清理
  await s.from('cbl_parents').delete().in('id', [row.id, row.id + '-svc']);
};
run();
