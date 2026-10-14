-- ============================================================================
-- 新增 Super Admin 帳戶
-- 帳號: admin / admin123
-- ============================================================================

-- 檢查是否已存在，避免重複插入
INSERT INTO public.cbl_users (id, phone, password, role, name, email, status, created_at)
VALUES (
  'user-super-admin',
  'admin',
  'admin123',
  'super_admin',
  '系統管理員',
  'admin@cloudbuslink.com',
  'active',
  now()
)
ON CONFLICT (phone) DO UPDATE
  SET password = EXCLUDED.password,
      name = EXCLUDED.name;
