-- ============================================================================
-- 0007 — 機構/公司層 (選項 B) + 學校必填 school 語義
--
-- 選項 B: cbl_clients 即學校表 (原「機構」更名為「學校」)。
--   - 學生/家長/校巴/司機/保姆/班次/路線/公告/接送記錄：client_id 必填 (= 所屬學校)
--   - 新增 cbl_companies (機構/公司表)：
--     僅保姆 / 司機 / 校巴 / super_admin 相關 User 可選配 company_id (非必填)
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- Idempotent: 可重複跑。
-- ============================================================================

-- 1) 新增 cbl_companies (機構/公司)
create table if not exists public.cbl_companies (
  id              text primary key,
  name            text not null,
  email           text not null default '',
  phone           text not null default '',
  address         text not null default '',
  logo            text,
  status          text not null default 'active' check (status in ('active','inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table  public.cbl_companies is '機構/公司 — 保姆/司機/校巴/User 可選配所屬公司 (非必填)';
comment on column public.cbl_clients.id is '學校 id (選項B: cbl_clients 即學校表)';

create index if not exists idx_cbl_companies_name on public.cbl_companies (name);

-- 2) 各表加 company_id (nullable FK → cbl_companies, on delete set null)
--    學生/家長/班次/路線/公告只掛學校，不加 company_id。
do $$
begin
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='cbl_drivers' and column_name='company_id') then
    alter table public.cbl_drivers
      add column company_id text references public.cbl_companies(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='cbl_buses' and column_name='company_id') then
    alter table public.cbl_buses
      add column company_id text references public.cbl_companies(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='cbl_nannies' and column_name='company_id') then
    alter table public.cbl_nannies
      add column company_id text references public.cbl_companies(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='cbl_users' and column_name='company_id') then
    alter table public.cbl_users
      add column company_id text references public.cbl_companies(id) on delete set null;
  end if;
end$$;

create index if not exists idx_cbl_drivers_company on public.cbl_drivers (company_id);
create index if not exists idx_cbl_buses_company   on public.cbl_buses (company_id);
create index if not exists idx_cbl_nannies_company on public.cbl_nannies (company_id);
create index if not exists idx_cbl_users_company  on public.cbl_users (company_id);

-- 3) updated_at trigger (companies)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_cbl_companies_updated') then
    create trigger trg_cbl_companies_updated before update on public.cbl_companies
      for each row execute function public.cbl_set_updated_at();
  end if;
end$$;

-- 4) RLS + dev policy (與其他 cbl_ 表一致：開發階段 anon 可讀寫，上線前收緊)
alter table public.cbl_companies enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbl_companies' and policyname = 'dev_allow_all'
  ) then
    create policy dev_allow_all on public.cbl_companies
      for all using (true) with check (true);
  end if;
end$$;

-- 驗證:
--   select table_name from information_schema.tables
--   where table_schema='public' and table_name in ('cbl_companies') order by 1;
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='cbl_buses' and column_name='company_id';
