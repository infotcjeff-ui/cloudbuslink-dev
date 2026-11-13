// ============================================================================
//  verify-student-school.mjs — 檢查 live DB 裡的學生有沒有 school_* 欄位
//
//  用途: 驗證 migration 0015 是否已套用到 live DB, 以及學生的學校資料
//        有沒有真的寫進雲端。
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = {};
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('❌ 缺少 Supabase 環境變數');
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  Accept: 'application/openapi+json',
};

async function main() {
  // 1) schema: 欄位存在嗎?
  const specRes = await fetch(`${URL}/rest/v1/`, { headers });
  const spec = await specRes.json();
  const defs = spec.definitions || spec.components?.schemas || {};
  const props = defs.cbl_students?.properties || {};
  const has = (c) => (c in props ? '✅' : '❌');
  console.log('=== live schema: cbl_students ===');
  console.log(`  school_type:     ${has('school_type')}`);
  console.log(`  school_district: ${has('school_district')}`);
  console.log(`  school_name:     ${has('school_name')}`);

  // 2) data: 學生資料有沒有?
  const dataRes = await fetch(`${URL}/rest/v1/cbl_students?select=*`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const rows = await dataRes.json();

  if (!Array.isArray(rows)) {
    console.log('\n❌ 讀取失敗:', JSON.stringify(rows).slice(0, 300));
    process.exit(1);
  }

  console.log(`\n=== live data: ${rows.length} 筆學生 ===`);
  for (const r of rows) {
    console.log(
      `  ${r.name || r.student_id || r.id} → ` +
        `type=${r.school_type ?? '(無此欄)'} ` +
        `district=${r.school_district ?? '(無此欄)'} ` +
        `school=${r.school_name ?? '(無此欄)'}`,
    );
  }

  // 3) 所有 client 的學生 (確認沒有漏掉別的 tenant)
  const allRes = await fetch(`${URL}/rest/v1/cbl_students?select=id,name,client_id,student_id,school_type,school_district,school_name&order=created_at.desc`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const all = await allRes.json();
  console.log(`\n=== 全部 cbl_students (含 client) — ${Array.isArray(all) ? all.length : '?'} 筆 ===`);
  if (Array.isArray(all)) {
    for (const r of all) {
      console.log(
        `  [${r.client_id || '?'}] ${r.name || '?'} (${r.student_id || '?'}) ` +
          `→ ${r.school_type ?? '—'} / ${r.school_district ?? '—'} / ${r.school_name ?? '—'}`,
      );
    }
  }

  // 4) clients 對照
  const cRes = await fetch(`${URL}/rest/v1/cbl_clients?select=id,name`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const clients = await cRes.json();
  console.log(`\n=== cbl_clients (${Array.isArray(clients) ? clients.length : '?'} 筆) ===`);
  if (Array.isArray(clients)) {
    for (const c of clients) console.log(`  ${c.id} → ${c.name}`);
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
