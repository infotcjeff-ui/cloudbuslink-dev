-- ============================================================================
-- 把內建的 demo 管理員帳號 (admin / admin123) 換成正式的擁有者帳號
--
-- 背景:
--   0003_add_super_admin.sql 建立了一個硬寫帳密的 super_admin:
--       phone = 'admin', password = 'admin123'
--   那組密碼寫死在 lib/hooks.ts (bootstrap 後門) — 任何知道帳密的人
--   都能取得系統最高權限。2026-10-26 已移除該後門, 改為:
--     - 超管必須在 /cbl-admin-setting/user 建立正式帳號
--     - 登入只從 cbl_users 查表, 不再自動重建任何帳號
--
-- 這支 migration 負責把 demo 帳號的憑證換成正式擁有者的:
--   name     → 'Jeff Chan'
--   email    → 'fonglongchan1018@gmail.com'
--   password → 與 email 相同 (沿用本專案「新增帳號時密碼預設與帳號相同」
--              的既有慣例, 首次登入後請立即在「用戶」頁改成自訂密碼)
--
-- 註: 密碼目前是明碼 (見 0001_init.sql 的 ⚠️ 註記), 上線前務必改成 hash。
-- ============================================================================

update public.cbl_users
set
  name     = 'Jeff Chan',
  email    = 'fonglongchan1018@gmail.com',
  password = 'fonglongchan1018@gmail.com',
  status   = 'active'
where phone = 'admin';

-- 防呆: 確認沒有其他帳號還在用 demo 密碼
-- (若下面這行有回傳結果, 代表有殘留的 demo 帳號需要手動清理)
--
-- select id, phone, name, role from public.cbl_users where password = 'admin123';
