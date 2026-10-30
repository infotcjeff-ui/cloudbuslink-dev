-- ============================================================================
-- 0012 — 診斷: cbl_drivers 雲端是空的 (修正 0011 的誤判)
--
-- 查明的事實 (用 anon + service_role 實測):
--   - cbl_drivers 兩種角色都只看到 0 筆 → 雲端真的沒有資料, 不是 RLS 擋住
--   - anon insert 測試成功 → dev_allow_all policy 有生效, 寫入權限正常
--   - 所以「RLS 政策拒絕 (無更新權限)」是程式的誤報:
--     update 一筆不存在的 id 會回傳 0 row, 外觀跟 RLS 過濾一模一樣,
--     於是程式把它誤判成 RLS 拒絕。
--
-- 程式端已修正 (lib/supabase-drivers.ts / lib/supabase-buses.ts):
--   update 找不到 row 時 → 先確認雲端有沒有這筆 → 沒有就用本機資料補建。
--
-- 本 migration 只做一件事: 把本機有、雲端沒有的司機補上去。
-- ⚠️ 執行前請先把 app 開著、並在司機頁按一次「重新整理」(讓本機有完整資料),
--    或直接用下方 SELECT 把 id/name 帶出來手動 insert。
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- Idempotent: 可重複跑。
-- ============================================================================

-- 1) 先看看雲端司機現在長什麼樣 (應該是 0 筆)
select id, name, phone, license_number, client_id, status, created_at
from public.cbl_drivers
order by created_at desc;

-- 2) 檢查校巴的司機綁定有沒有指向不存在的司機 (dangling FK)
select b.id, b.plate_number, b.driver_id
from public.cbl_buses b
where b.driver_id is not null
  and not exists (select 1 from public.cbl_drivers d where d.id = b.driver_id);

-- 3) 補齊欄位檢查: 確認 schema 跟程式一致 (driver 需要 name/phone/license_number)
select
  column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'cbl_drivers'
order by ordinal_position;

-- ============================================================================
-- 手動補建模板 (把 id / name / phone / license_number 換成你本機的值):
--
--   insert into public.cbl_drivers
--     (id, client_id, name, phone, license_number, photo, status, created_at)
--   values
--     ('driver-xxx', 'client-mvqc4fl6-sg95a', '陳大文', '91234567', 'A1234567',
--      null, 'available', now())
--   on conflict (id) do update set
--     name = excluded.name,
--     phone = excluded.phone,
--     license_number = excluded.license_number,
--     status = excluded.status;
--
-- 取得本機的 id: 開 DevTools → Console 執行
--   JSON.parse(localStorage.getItem('cbl_drivers')).map(d => ({id: d.id, name: d.name}))
-- ============================================================================
