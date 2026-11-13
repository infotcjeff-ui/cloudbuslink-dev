-- ============================================================================
--  Migration 0014: cbl_routes 新增 service_date / service_time
--
--  背景:
--   路線主體資料新增「日期及時間」picker (選填)。
--   選填 → NULL 允許, 不設 NOT NULL / default, 舊資料不受影響。
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cbl_routes'
      AND column_name = 'service_date'
  ) THEN
    ALTER TABLE public.cbl_routes
      ADD COLUMN service_date date NULL;
    COMMENT ON COLUMN public.cbl_routes.service_date IS
      '服務日期 (YYYY-MM-DD, 選填) — 路線主體資料日期 picker';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cbl_routes'
      AND column_name = 'service_time'
  ) THEN
    ALTER TABLE public.cbl_routes
      ADD COLUMN service_time text NULL;
    COMMENT ON COLUMN public.cbl_routes.service_time IS
      '服務時間 (HH:mm, 選填) — 路線主體資料時間 picker';
  END IF;
END $$;
