-- ============================================================================
-- 0016 — cbl_academic_years 學年登錄表
--
-- 背景:
--   目前全系統的資料隔離只靠 cbl_clients.client_id 一層。
--   學年 (academic_year) 只出現在三個地方:
--     - 學生編號前綴  stu-2627001
--     - 路線編號前綴  2627-001AM
--     - 報表匯出的「學年」欄
--   → 學年目前只是一個「標籤」, 不是資料邊界。
--   26-27 的舊學生與 27-28 的新學生會混在同一張表、同一個清單裡。
--
-- 設計:
--   這張表是「學年」的權威來源 (single source of truth), 回答三個問題:
--     1. 這個 client 有哪些學年?
--     2. 哪個是現行學年 (is_current)?
--     3. 每個學年的起訖與狀態 (upcoming / active / archived)?
--
--   為什麼不用 cbl_clients.academic_year:
--     - 那只是一個單值, 無法表達「有哪些歷史學年」
--     - 無起訖日期, 無狀態
--     - 不同學校的開學時間不一定相同 → 必須 per-client
--   cbl_clients.academic_year 保留不動 (降級為顯示用 / 舊程式相容)。
--
--   ⚠️ 每 client 最多一筆 is_current = true:
--     用 partial unique index 保證 (不是用 trigger) ——
--     partial unique index 是資料庫層的硬約束, 不會被應用層的 bug 繞過。
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- Idempotent: 可重複跑。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) 建立表
-- ---------------------------------------------------------------------------
create table if not exists public.cbl_academic_years (
  id              text primary key,                          -- e.g. 'ay-2627-<clientId>'
  client_id       text not null references public.cbl_clients(id) on delete cascade,
  academic_year   text not null,                              -- 4 位 code: '2627' = 2026/27
  label           text,                                       -- 顯示用, 例如 '2026/27 學年' (nullable)
  status          text not null default 'active'
                    check (status in ('upcoming','active','archived')),
  is_current      boolean not null default false,
  start_date      date,                                       -- nullable: 不強制 (有些學校 9 月開學)
  end_date        date,                                       -- nullable
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, academic_year)
);

comment on table public.cbl_academic_years is
  '學年登錄表 — 每個 client × 每個學年一列, 是「當前學年」的權威來源 (is_current)。';
comment on column public.cbl_academic_years.academic_year is
  '4 位學年代碼: 2627 = 2026/27 學年 (與 lib/utils.ts formatAcademicYear 一致)';
comment on column public.cbl_academic_years.status is
  'upcoming = 即將開始 (可預先建資料, 不可開班) / active = 現行 (可編輯) / archived = 已封存 (唯讀)';
comment on column public.cbl_academic_years.is_current is
  '是否為該 client 的現行學年 — 每個 client 最多一筆 true (partial unique index 保障)';

-- ---------------------------------------------------------------------------
-- 2) Index
-- ---------------------------------------------------------------------------
create index if not exists idx_cbl_academic_years_client
  on public.cbl_academic_years (client_id);

-- ⚠️ 核心約束: 每個 client 最多一筆 is_current = true
--   partial unique index → 只對 is_current = true 的列生效。
--   這個是資料庫層的硬約束, 應用層寫錯也無法塞進第二筆現行學年。
create unique index if not exists idx_cbl_academic_years_current
  on public.cbl_academic_years (client_id)
  where is_current;

-- ---------------------------------------------------------------------------
-- 3) updated_at trigger (沿用 cbl_set_updated_at)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_cbl_academic_years_updated') then
    create trigger trg_cbl_academic_years_updated before update on public.cbl_academic_years
      for each row execute function public.cbl_set_updated_at();
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 4) RLS + dev policy (與其他 cbl_ 表一致)
-- ---------------------------------------------------------------------------
alter table public.cbl_academic_years enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbl_academic_years' and policyname = 'dev_allow_all'
  ) then
    create policy dev_allow_all on public.cbl_academic_years
      for all using (true) with check (true);
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 5) 初始列 — 為每個既有 client 補一筆現行學年
--
--   依 cbl_clients.academic_year (既有欄位) 決定該 client 的學年。
--   若該 client 的 academic_year 是空字串 → 用 '2627' 兜底。
--
--   ⚠️ 只補「不存在」的, 不覆蓋既有列 (可重複跑)。
-- ---------------------------------------------------------------------------
insert into public.cbl_academic_years (id, client_id, academic_year, label, status, is_current)
select
  'ay-' || c.academic_year || '-' || c.id,
  c.id,
  case
    when c.academic_year ~ '^[0-9]{4}$' then c.academic_year
    else '2627'
  end,
  case
    when c.academic_year ~ '^[0-9]{4}$'
      then left(c.academic_year, 2) || '/' || right(c.academic_year, 2) || ' 學年'
    else '2026/27 學年'
  end,
  'active',
  true
from public.cbl_clients c
where not exists (
  select 1 from public.cbl_academic_years ay
  where ay.client_id = c.id
);

-- ---------------------------------------------------------------------------
-- 驗證:
--   select client_id, academic_year, status, is_current
--   from public.cbl_academic_years order by client_id, academic_year;
--
--   -- 應對每個 client 只看到一筆 is_current = true
--   select client_id, count(*) from public.cbl_academic_years
--   where is_current group by client_id having count(*) > 1;
-- ============================================================================
