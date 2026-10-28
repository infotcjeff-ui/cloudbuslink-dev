-- ============================================================================
-- 0006 — 新增 system_admin 角色 (開發者最高權限) + admin 帳號升級
--
-- 做法二:
--   - system_admin = L4 開發者/平台維運, 唯一能進 /system-admin-setting 看敏感資料
--   - super_admin  = L3 營運總管, 維持跨機構業務管理, 但看不到 System Admin Setting
--   - 登入帳號 admin (phone = 'admin') 從 super_admin 升級為 system_admin
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- Idempotent: 可重複跑。
-- ============================================================================

-- 1) 放行 role check: 加入 'system_admin'
alter table public.cbl_users drop constraint if exists cbl_users_role_check;

alter table public.cbl_users
  add constraint cbl_users_role_check
  check (role in ('system_admin','super_admin','client','parent','nanny'));

comment on table public.cbl_users is '登入帳號(system_admin開發者/super_admin營運/客戶/家長/保姆)';

-- 2) admin 帳號升級為 system_admin (開發者帳號)
update public.cbl_users
set role = 'system_admin'
where phone = 'admin';

-- 驗證 (應只回傳 1 筆, role = system_admin):
-- select id, phone, name, role, status from public.cbl_users where phone = 'admin';
