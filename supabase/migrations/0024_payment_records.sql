-- ============================================================================
--  Migration 0024: cbl_payment_records (付款記錄)
--
--  背景:
--   - 報表頁 (/settings/reports) 要支援「多選 → 標記已付 / 取消 / 發送繳費通知」,
--     這需要一個「可逐筆標記狀態 + 記錄金額 + 收款對象」的資料模型。
--   - 之前付款記錄只是 /cbl-admin-setting/parents/payment 的 coming-soon 佔位,
--     沒有任何實體 → 報表頁沒有可操作的資料。
--   - 繳費公告 (scope='payment') 的內容 / 類型 / 有效期也預期由這裡帶出。
--
--  設計:
--   - 每筆 = 一個學生一期的繳費帳單 (period 例: '2026-11' 或 '2026-2027-S1')。
--   - status: pending (未付) / paid (已付) / cancelled (已取消) / overdue (逾期)。
--   - student_name / parent_name / parent_phone 是「快照」——
--     改名 / 改電話之後, 舊帳單要保留當時的收款資訊, 不能被 join 洗掉。
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cbl_payment_records (
  id                   text primary key,
  client_id            text references public.cbl_clients(id) on delete set null,
  period               text not null default '',
  student_id           text not null default '',
  student_name         text not null default '',
  parent_id            text not null default '',
  parent_name          text not null default '',
  parent_phone         text not null default '',
  amount               numeric(12,2) not null default 0,
  status               text not null default 'pending'
                         check (status in ('pending','paid','cancelled','overdue')),
  method               text null
                         check (method is null or method in ('cash','fps','bank_transfer','cheque','other')),
  paid_date            date null,
  due_date             date not null default current_date,
  notes                text null,
  payment_notified_at  timestamptz null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_cbl_payment_records_client
  ON public.cbl_payment_records (client_id);
CREATE INDEX IF NOT EXISTS idx_cbl_payment_records_status
  ON public.cbl_payment_records (status);
CREATE INDEX IF NOT EXISTS idx_cbl_payment_records_student
  ON public.cbl_payment_records (student_id);
CREATE INDEX IF NOT EXISTS idx_cbl_payment_records_parent
  ON public.cbl_payment_records (parent_id);
CREATE INDEX IF NOT EXISTS idx_cbl_payment_records_period
  ON public.cbl_payment_records (period);
CREATE INDEX IF NOT EXISTS idx_cbl_payment_records_due
  ON public.cbl_payment_records (due_date DESC);

COMMENT ON TABLE public.cbl_payment_records IS '付款記錄 — 報表頁 (settings/reports) 的資料來源, 支援多選批次標記已付 / 取消 / 發送繳費通知';

-- ---------------------------------------------------------------------------
--  RLS (開發階段)
--
--  ⚠️ 跟其他表一致: 開發期先開 dev_allow_all (anon 可讀寫)。
--    上線前必須移除, 改成 per-role policy (家長只能看自己的付款記錄)。
-- ---------------------------------------------------------------------------
ALTER TABLE public.cbl_payment_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cbl_payment_records'
      AND policyname = 'dev_allow_all_payment_records'
  ) THEN
    CREATE POLICY "dev_allow_all_payment_records" ON public.cbl_payment_records
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
