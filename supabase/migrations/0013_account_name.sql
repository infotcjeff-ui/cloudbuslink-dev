-- ============================================================================
--  Migration 0013: account_name 欄位
--
--  背景:
--   1. 保姆 / 家長需要「帳戶名稱」 — 與電話號碼都可作為登入帳號。
--      (電話會外洩給家長 / 校方; 自訂帳戶名稱更易記。)
--   2. cbl_users.account_name 用於雲端登入查找 (跨裝置)。
--   3. cbl_nannies.account_name / cbl_parents.account_name 是「自癒」用途:
--      若 cbl_users 遺失 (RLS 拒絕 / sync 覆蓋), 可從該筆資料的 account_name
--      + phone 反查並補回 user。詳見 lib/auth-lookup.ts。
--
--  欄位規則 (與前端一致):
--   - account_name: text, NULL 允許 (選填 — 沒填就只能用電話登入)
--   - cbl_users 上建議唯一 (但不同租戶間同名帳號可以接受, 所以只加普通 index
--     而非 UNIQUE constraint; 重複檢查由應用層處理)。
-- ============================================================================

-- ---- 1) cbl_users.account_name ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cbl_users'
      AND column_name = 'account_name'
  ) THEN
    ALTER TABLE public.cbl_users
      ADD COLUMN account_name text NULL;
    COMMENT ON COLUMN public.cbl_users.account_name IS
      '帳戶名稱 (選填) — 與 phone 皆可作為登入帳號。規則: 3-32 位英數字元 / _ . -';
  END IF;
END $$;

-- index: 登入查找用 (account_name 不分大小寫比對; index 只加速完全相符)
CREATE INDEX IF NOT EXISTS idx_cbl_users_account_name
  ON public.cbl_users (account_name);

-- ---- 2) cbl_nannies.account_name ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cbl_nannies'
      AND column_name = 'account_name'
  ) THEN
    ALTER TABLE public.cbl_nannies
      ADD COLUMN account_name text NULL;
    COMMENT ON COLUMN public.cbl_nannies.account_name IS
      '帳戶名稱 (選填) — 與 phone 皆可作為登入帳號。自癒用途: cbl_users 遺失時可由此反查補回。';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cbl_nannies_account_name
  ON public.cbl_nannies (account_name);

-- ---- 3) cbl_parents.account_name ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cbl_parents'
      AND column_name = 'account_name'
  ) THEN
    ALTER TABLE public.cbl_parents
      ADD COLUMN account_name text NULL;
    COMMENT ON COLUMN public.cbl_parents.account_name IS
      '帳戶名稱 (選填) — 與 phone 皆可作為登入帳號。自癒用途: cbl_users 遺失時可由此反查補回。';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cbl_parents_account_name
  ON public.cbl_parents (account_name);
