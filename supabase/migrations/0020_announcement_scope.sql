-- ============================================================================
-- 0020 — 公告受眾分類 (系統公告 / 繳費公告)
-- ============================================================================
--
-- 需求 (2026-11):
--   1. 移除「發佈機構」欄位 → 公告不再綁單一機構
--   2. 公告分成兩類:
--        - 'system'  系統公告 → 所有用戶都會看到
--        - 'payment' 繳費公告 → 只有被選中的家長會看到
--
-- 為什麼 client_id 要改成 nullable:
--   cbl_announcements.client_id 原本是 NOT NULL + FK → 必須指定一間學校。
--   但「系統公告對所有用戶顯示」意味著它不屬於任何單一機構。
--   → 把 client_id 改成 nullable, 系統公告用 NULL 表示「不限機構」。
--   ⚠️ FK 約束保留 (on delete cascade) → 有 client_id 的公告,
--      該機構被刪時仍然會跟著 cascade 刪除 (既有行為不變)。
--
-- ⚠️ 舊資料怎麼處理:
--   既有公告一律視為「系統公告」 (scope='system', target_parent_ids='{}'),
--   但保留原本的 client_id — 這樣:
--     - 不會有任何公告憑空消失
--     - 舊公告仍然只對原本機構的用戶可見 (由 app 層的受眾判斷處理)
--   若要讓舊公告也對所有人可見, 把 client_id 改成 NULL 即可 (見文末 SQL)。
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- Idempotent: 可重複跑。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) cbl_announcements.scope — 受眾類型
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cbl_announcements'
      and column_name = 'scope'
  ) then
    alter table public.cbl_announcements
      add column scope text not null default 'system'
        check (scope in ('system','payment'));
    comment on column public.cbl_announcements.scope is
      '公告受眾類型: system = 所有用戶都看到; payment = 只有 target_parent_ids 內的家長看到';
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2) cbl_announcements.target_parent_ids — 繳費公告的指定家長
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cbl_announcements'
      and column_name = 'target_parent_ids'
  ) then
    alter table public.cbl_announcements
      add column target_parent_ids text[] not null default '{}';
    comment on column public.cbl_announcements.target_parent_ids is
      '繳費公告的指定家長 (cbl_parents.id)。scope=system 時為空陣列。';
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 3) cbl_announcements.client_id — 改成 nullable (支援「不限機構」的系統公告)
-- ---------------------------------------------------------------------------
alter table public.cbl_announcements
  alter column client_id drop not null;

-- ---------------------------------------------------------------------------
-- 4) Index
-- ---------------------------------------------------------------------------
-- 受眾查詢: 「某個家長會看到的繳費公告」
create index if not exists idx_cbl_announcements_scope
  on public.cbl_announcements (scope);

-- target_parent_ids 是 text[] → GIN index 支援 @> / && 查詢
create index if not exists idx_cbl_announcements_target_parent_ids
  on public.cbl_announcements using gin (target_parent_ids);

-- ---------------------------------------------------------------------------
-- 5) 回填: 舊公告 → 系統公告, 無指定家長
-- ---------------------------------------------------------------------------
update public.cbl_announcements
set scope = 'system',
    target_parent_ids = '{}'
where scope is distinct from 'system'
   or target_parent_ids is null;

-- ---------------------------------------------------------------------------
-- 6) 可選: 讓所有既有公告都變成「不限機構」的系統公告
--    (取消下面這段的註解再跑一次, 即可讓舊公告也對所有用戶顯示)
-- ---------------------------------------------------------------------------
-- update public.cbl_announcements set client_id = null where scope = 'system';

-- ============================================================================
-- 驗證:
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'cbl_announcements'
--     and column_name in ('scope','target_parent_ids','client_id')
--   order by column_name;
--
-- 應該看到:
--   client_id          | text  | YES (nullable)
--   scope              | text  | NO  | default 'system'
--   target_parent_ids  | ARRAY | NO  | default '{}'
--
-- -- 公告分佈:
--   select scope, count(*) from public.cbl_announcements group by scope;
-- ============================================================================
