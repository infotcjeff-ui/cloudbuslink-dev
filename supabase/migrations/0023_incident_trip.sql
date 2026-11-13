-- ============================================================================
--  Migration 0023: cbl_incident_reports 加班次欄位
--
--  背景:
--   - 保姆異常回報 form 新增「選擇班次 (當天)」欄, 需留底 trip 詳情,
--     並在 /cbl-admin-setting/incidents 的 listing 顯示。
-- ============================================================================

ALTER TABLE public.cbl_incident_reports
  ADD COLUMN IF NOT EXISTS trip_id    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trip_label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trip_date  text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_cbl_incident_reports_trip_date
  ON public.cbl_incident_reports (trip_date DESC);

COMMENT ON COLUMN public.cbl_incident_reports.trip_id IS '相關班次 cbl_trips.id, 可空 = 未選擇';
COMMENT ON COLUMN public.cbl_incident_reports.trip_label IS '班次快照 (例: 11-04 上午班 · NA1234), 免 join';
COMMENT ON COLUMN public.cbl_incident_reports.trip_date IS '班次日期 YYYY-MM-DD 快照, 方便篩選';
