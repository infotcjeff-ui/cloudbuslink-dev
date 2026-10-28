const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const env = {};
const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const op = process.argv[2];

  if (op === 'insert-student') {
    const { data, error } = await supabase
      .from('cbl_students')
      .insert({
        id: 'cloud-test-student-001',
        client_id: 'client-mvqc4fl6-sg95a',
        student_id: 'stu-CLOUD01',
        name: '雲端新增學生',
        class_number: '3B',
        phone: null,
        photo: null,
        gender: 'male',
        date_of_birth: '2016-01-01',
        emergency_contact_name: null,
        emergency_contact_phone: null,
        emergency_contact_relationship: null,
        status: 'active',
        parent_ids: [],
        primary_parent_id: null,
        bus_id: null,
        pickup_location: null,
        dropoff_location: null,
        created_at: new Date().toISOString(),
      })
      .select();
    console.log(error ? 'ERROR: ' + JSON.stringify(error) : 'OK: ' + JSON.stringify(data));
  }

  if (op === 'count') {
    const { data, error } = await supabase.from('cbl_students').select('id,name,client_id');
    console.log(error ? 'ERROR: ' + JSON.stringify(error) : JSON.stringify(data, null, 2));
  }

  if (op === 'cleanup') {
    const { error } = await supabase.from('cbl_students').delete().in('id', ['cloud-test-student-001']);
    const e2 = await supabase.from('cbl_buses').delete().in('id', ['cloud-test-bus-001']);
    console.log(error ? 'ERROR: ' + JSON.stringify(error) : 'OK');
    console.log(e2.error ? 'ERROR: ' + JSON.stringify(e2.error) : 'OK buses');
  }
})();
