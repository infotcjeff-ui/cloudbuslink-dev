-- ============================================================================
--  Migration 0022: cbl_incident_reports (保姆異常回報留底)
--
--  背景:
--   - 保姆主頁「異常回報」popup 原本只開 tel:/wa.me, 無留底 → 後台睇唔到。
--   - 此表記錄每次「確定送出」: 邊個保姆 / 咩異常 / 通知邊位管理員 / 處理狀態。
--   - client_id 可空: 跨機構帳號回報時無所屬學校照樣寫得入 (與 cbl_users 一致)。
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cbl_incident_reports (
  id              text primary key,
  client_id       text references public.cbl_clients(id) on delete set null,
  nanny_id        text not null default '',
  reporter_name   text not null default '',
  reporter_phone  text not null default '',
  admin_id        text not null default '',
  admin_name      text not null default '',
  admin_phone     text not null default '',
  kind            text not null default 'other'
                    check (kind in ('traffic','no_show','breakdown','accident','weather','road_closed','sick','other')),
  kind_label      text not null default '',
  status          text not null default 'pending'
                    check (status in ('pending','acknowledged','resolved')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_cbl_incident_reports_client
  ON public.cbl_incident_reports (client_id);
CREATE INDEX IF NOT EXISTS idx_cbl_incident_reports_nanny
  ON public.cbl_incident_reports (nanny_id);
CREATE INDEX IF NOT EXISTS idx_cbl_incident_reports_created
  ON public.cbl_incident_reports (created_at DESC);

COMMENT ON TABLE public.cbl_incident_reports IS '保姆異常回報留底 — 每次 popup 確定送出一筆, CBL Admin Setting 可檢視 / 標已讀 / 標解決';
