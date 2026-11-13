-- ============================================================================
--  Migration 0021: cbl_users.contact_phone (聯絡電話 WhatsApp)
--
--  背景:
--   - 保姆「異常回報」需要直接致電 / WhatsApp 系統管理員。
--   - `phone` 是登入帳號 (super_admin 可以是非數字的 `admin`),
--     不能保證可撥打 → 獨立一個 `contact_phone` 存可撥打的香港 8 位號碼。
--   - 新增 / 編輯登入帳號 form 必填, 異常回報 popup 用此號碼產生
--     tel: / https://wa.me/852xxxx 連結。
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cbl_users'
      AND column_name = 'contact_phone'
  ) THEN
    ALTER TABLE public.cbl_users
      ADD COLUMN contact_phone text NULL;
    COMMENT ON COLUMN public.cbl_users.contact_phone IS
      '聯絡電話 (WhatsApp, 可撥打的 8 位香港號碼) — 保姆異常回報時直接致電 / WhatsApp 此號碼。與 phone (登入帳號) 分開。';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cbl_users_contact_phone
  ON public.cbl_users (contact_phone);
