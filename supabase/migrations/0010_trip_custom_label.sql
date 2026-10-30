-- ============================================================================
-- 0010 — cbl_trips.custom_type_label (自訂班次類型名稱)
--
-- 背景:
--   班次表單「班次類型 = 自訂」時, 需要一個文字欄位讓用戶自行輸入
--   (e.g. 課外活動、補習班…), 右邊預覽即時顯示該名稱。
--   舊 schema 只有 type='custom', 顯示一律是「自訂」, 無法區分。
--
-- 設計:
--   - custom_type_label nullable: 只有 type='custom' 時有值, 其他類型為 null
--   - 舊班次 / 非自訂班次留 null (顯示時退回「自訂」)
--
-- 本 migration 是 idempotent (可重複執行)。
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cbl_trips'
      and column_name = 'custom_type_label'
  ) then
    alter table public.cbl_trips
      add column custom_type_label text;

    comment on column public.cbl_trips.custom_type_label is
      '自訂班次類型名稱 — 僅 type=''custom'' 時有值 (e.g. 課外活動); null = 非自訂或舊班次';
  end if;
end$$;

-- 驗證:
--   select id, type, custom_type_label from public.cbl_trips where type = 'custom';
