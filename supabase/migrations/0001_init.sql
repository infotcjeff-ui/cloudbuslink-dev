-- ============================================================================
-- CloudBusLink — Initial Schema (Idempotent)
-- 對應 lib/types.ts 的 13 個實體,所有 table 強制 cbl_ 前綴 (Postgres 不接受 -)
--
-- 適用於 Supabase project: ytpbbqlgbgfjloqislbh
-- 執行位置: Supabase Dashboard → SQL Editor → New query
--
-- ⚠️ 這份是 idempotent (可以重複跑): CREATE ... IF NOT EXISTS,
--    CREATE POLICY 用 DO block 包起來,policy 存在就跳過。
--    但 DROP 行為要慎用,production 跑第二次不會丟資料。
-- ============================================================================

-- 啟用必要的 extensions
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "postgis";       -- GPS 座標 (可選,先啟用)

-- ============================================================================
-- 1. cbl_clients  客戶(學校/機構) — tenant
-- ============================================================================
create table if not exists public.cbl_clients (
  id              text primary key,
  name            text not null,
  email           text not null default '',
  phone           text not null default '',
  address         text not null default '',
  logo            text,                          -- URL
  primary_color   text not null default '#3b82f6',
  academic_year   text not null default '2627',
  status          text not null default 'active' check (status in ('active','inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table  public.cbl_clients is '客戶(學校/機構) — 每個 client 是一個 tenant';
comment on column public.cbl_clients.primary_color is 'UI 主色 (hex)';

-- ============================================================================
-- 2. cbl_users  登入帳號 (跨 client, super_admin 沒有 clientId)
-- ============================================================================
create table if not exists public.cbl_users (
  id              text primary key,
  phone           text not null unique,
  password        text not null,                 -- ⚠️ 將來改 hash (bcrypt)
  role            text not null check (role in ('super_admin','client','parent','nanny')),
  name            text not null,
  email           text,
  client_id       text references public.cbl_clients(id) on delete set null,
  photo           text,
  status          text not null default 'active' check (status in ('active','inactive')),
  created_at      timestamptz not null default now()
);
create index if not exists idx_cbl_users_phone   on public.cbl_users (phone);
create index if not exists idx_cbl_users_client  on public.cbl_users (client_id);
comment on table  public.cbl_users is '登入帳號(超管/客戶/家長/保姆)';
comment on column public.cbl_users.password is '⚠️ demo 階段明碼,上線前要改 hash';

-- ============================================================================
-- 3. cbl_drivers  司機
-- ============================================================================
create table if not exists public.cbl_drivers (
  id              text primary key,
  client_id       text not null references public.cbl_clients(id) on delete cascade,
  name            text not null,
  phone           text not null default '',
  license_number  text not null default '',
  photo           text,
  status          text not null default 'available'
                    check (status in ('available','on_trip','off_duty')),
  created_at      timestamptz not null default now()
);
create index if not exists idx_cbl_drivers_client on public.cbl_drivers (client_id);
comment on table  public.cbl_drivers is '司機 — 屬於某個 client';

-- ============================================================================
-- 4. cbl_buses  校巴
-- ============================================================================
create table if not exists public.cbl_buses (
  id              text primary key,
  client_id       text not null references public.cbl_clients(id) on delete cascade,
  plate_number    text not null,
  model           text not null default '',
  capacity        integer not null default 0 check (capacity >= 0),
  driver_id       text references public.cbl_drivers(id) on delete set null,
  gps_device_id   text,
  status          text not null default 'active'
                    check (status in ('active','maintenance','inactive')),
  current_location jsonb,                        -- {latitude, longitude, speed, lastUpdated}
  created_at      timestamptz not null default now()
);
create index if not exists idx_cbl_buses_client on public.cbl_buses (client_id);
create index if not exists idx_cbl_buses_driver on public.cbl_buses (driver_id);
comment on column public.cbl_buses.current_location is '模擬 GPS {latitude, longitude, speed, lastUpdated}';

-- ============================================================================
-- 5. cbl_parents  家長
-- ============================================================================
create table if not exists public.cbl_parents (
  id                       text primary key,
  client_id                text not null references public.cbl_clients(id) on delete cascade,
  name                     text not null,
  phone                    text not null,
  alternate_phone          text,
  home_phone               text,
  office_phone             text,
  address                  text,
  relationship             text not null check (relationship in (
                           'father','mother',
                           'grandfather_paternal','grandmother_paternal',
                           'grandfather_maternal','grandmother_maternal',
                           'guardian_other')),
  is_pickup_auth           boolean not null default false,
  is_primary_contact       boolean default false,  -- @deprecated, 改用 student.primary_parent_id
  password                 text not null,           -- 與 phone 共同登入
  notification_enabled     boolean not null default true,
  status                   text not null default 'active' check (status in ('active','inactive')),
  created_at               timestamptz not null default now()
);
create index if not exists idx_cbl_parents_client on public.cbl_parents (client_id);
create index if not exists idx_cbl_parents_phone  on public.cbl_parents (phone);

-- ============================================================================
-- 6. cbl_students  學生
-- ============================================================================
create table if not exists public.cbl_students (
  id                              text primary key,
  client_id                       text not null references public.cbl_clients(id) on delete cascade,
  student_id                      text not null,                 -- stu-2627001
  name                            text not null,
  class_number                    text not null default '',
  phone                           text,
  photo                           text,
  gender                          text not null default 'male'
                                    check (gender in ('male','female','other')),
  date_of_birth                   date,
  emergency_contact_name          text,
  emergency_contact_phone         text,
  emergency_contact_relationship  text,                          -- 對應 parents.relationship
  status                          text not null default 'active'
                                    check (status in ('active','graduated','suspended')),
  parent_ids                      text[] not null default '{}',  -- text[] of cbl_parents.id
  primary_parent_id               text,                          -- 必須在 parent_ids 之內 (app 層檢查)
  bus_id                          text references public.cbl_buses(id) on delete set null,
  pickup_location                 jsonb,                         -- Location
  dropoff_location                jsonb,                         -- Location
  created_at                      timestamptz not null default now(),
  unique (client_id, student_id)
);
create index if not exists idx_cbl_students_client  on public.cbl_students (client_id);
create index if not exists idx_cbl_students_bus     on public.cbl_students (bus_id);
create index if not exists idx_cbl_students_parents on public.cbl_students using gin (parent_ids);
comment on column public.cbl_students.parent_ids is '家長 id 陣列, 透過 application 層與 cbl_parents.id 維持一致';
comment on column public.cbl_students.primary_parent_id is '主要聯繫人, 必須在 parent_ids 之內';

-- ============================================================================
-- 7. cbl_nannies  保姆
-- ============================================================================
create table if not exists public.cbl_nannies (
  id                text primary key,
  client_id         text not null references public.cbl_clients(id) on delete cascade,
  name              text not null,
  phone             text not null,
  employee_id       text not null default '',
  photo             text,
  assigned_bus_ids  text[] not null default '{}',  -- text[] of cbl_buses.id
  status            text not null default 'active' check (status in ('active','inactive')),
  created_at        timestamptz not null default now()
);
create index if not exists idx_cbl_nannies_client  on public.cbl_nannies (client_id);
create index if not exists idx_cbl_nannies_buses   on public.cbl_nannies using gin (assigned_bus_ids);

-- ============================================================================
-- 8. cbl_routes  校巴路線 (master info)
-- ============================================================================
create table if not exists public.cbl_routes (
  id          text primary key,
  client_id   text not null references public.cbl_clients(id) on delete cascade,
  code        text not null,                      -- A1-AM
  name        text not null,                      -- 黃大仙早上線
  shift_type  text not null default 'morning'
                check (shift_type in ('morning','afternoon','extracurricular')),
  bus_id      text references public.cbl_buses(id) on delete set null,
  driver_id   text references public.cbl_drivers(id) on delete set null,
  nanny_id    text references public.cbl_nannies(id) on delete set null,
  stops       jsonb not null default '[]'::jsonb, -- RouteStop[] (UI 排序方便)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, code)
);
create index if not exists idx_cbl_routes_client on public.cbl_routes (client_id);
create index if not exists idx_cbl_routes_bus    on public.cbl_routes (bus_id);
create index if not exists idx_cbl_routes_stops  on public.cbl_routes using gin (stops);
comment on column public.cbl_routes.stops is 'RouteStop[] — 用 jsonb 儲存以配合現有 UI (cbl_route_stops 為正規化版本,未來切換)';

-- ============================================================================
-- 9. cbl_trips  班次
-- ============================================================================
create table if not exists public.cbl_trips (
  id                   text primary key,
  client_id            text not null references public.cbl_clients(id) on delete cascade,
  bus_id               text not null references public.cbl_buses(id) on delete cascade,
  nanny_id             text references public.cbl_nannies(id) on delete set null,
  date                 date not null,
  type                 text not null default 'morning'
                         check (type in ('morning','afternoon','custom')),
  status               text not null default 'scheduled'
                         check (status in ('scheduled','in_progress','completed','cancelled')),
  planned_start_time   text not null default '',  -- HH:mm
  planned_end_time     text not null default '',
  actual_start_time    timestamptz,
  actual_end_time      timestamptz,
  student_ids          text[] not null default '{}',
  waypoints            jsonb not null default '[]'::jsonb,  -- Waypoint[]
  current_route_index  integer not null default 0,
  completed_stops      text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_cbl_trips_client_date on public.cbl_trips (client_id, date);
create index if not exists idx_cbl_trips_bus         on public.cbl_trips (bus_id);
create index if not exists idx_cbl_trips_nanny       on public.cbl_trips (nanny_id);
create index if not exists idx_cbl_trips_students    on public.cbl_trips using gin (student_ids);

-- ============================================================================
-- 10. cbl_attendances  打卡記錄
-- ============================================================================
create table if not exists public.cbl_attendances (
  id                text primary key,
  trip_id           text not null references public.cbl_trips(id) on delete cascade,
  student_id        text not null references public.cbl_students(id) on delete cascade,
  waypoint_id       text not null,
  boarding_time     timestamptz,
  boarding_status   text not null default 'on_time'
                      check (boarding_status in ('on_time','late','no_show','absent')),
  boarding_photo    text,
  boarded_by        text not null,                 -- nanny id
  dropoff_time      timestamptz,
  dropoff_status    text check (dropoff_status in ('on_time','late','early','no_show')),
  dropoff_photo     text,
  dropoff_by        text,
  notes             text,
  is_confirmed      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (trip_id, student_id, waypoint_id)        -- 配合 storage.upsert 行為
);
create index if not exists idx_cbl_attendances_trip     on public.cbl_attendances (trip_id);
create index if not exists idx_cbl_attendances_student  on public.cbl_attendances (student_id);
create index if not exists idx_cbl_attendances_boarding on public.cbl_attendances (boarding_time);

-- ============================================================================
-- 11. cbl_announcements  公告
-- ============================================================================
create table if not exists public.cbl_announcements (
  id                 text primary key,
  client_id          text not null references public.cbl_clients(id) on delete cascade,
  title              text not null,
  content            text not null default '',
  type               text not null default 'info'
                       check (type in ('info','warning','urgent')),
  display_count      integer not null default 1,
  current_count      integer not null default 0,
  max_views_per_user integer not null default 1,
  start_date         timestamptz not null default now(),
  end_date           timestamptz not null,
  is_active          boolean not null default true,
  is_template        boolean not null default false,
  template_name      text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_cbl_announcements_client on public.cbl_announcements (client_id);
create index if not exists idx_cbl_announcements_active on public.cbl_announcements (client_id, is_active, start_date, end_date);

-- ============================================================================
-- 12. cbl_announcement_reads  公告已讀記錄 (取代 localStorage)
-- ============================================================================
create table if not exists public.cbl_announcement_reads (
  user_id     text not null,
  client_id   text not null,
  read_ids    text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- ============================================================================
-- 13. cbl_site_settings  客戶網站設定 (每 client 一筆, PK = client_id)
-- ============================================================================
create table if not exists public.cbl_site_settings (
  client_id              text primary key references public.cbl_clients(id) on delete cascade,
  logo                   text,
  title                  text not null default 'CloudBusLink',
  primary_color          text not null default '#3b82f6',
  phone                  text not null default '',
  email                  text not null default '',
  address                text not null default '',
  student_id_prefix      text not null default 'stu-',
  academic_year          text not null default '2627',
  academic_year_start    integer not null default 9,
  push_notifications     boolean not null default true,
  email_notifications    boolean not null default false,
  updated_at             timestamptz not null default now()
);

-- ============================================================================
-- updated_at 自動觸發器
-- ============================================================================
create or replace function public.cbl_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 用 DO block,trigger 已存在就跳過
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_cbl_clients_updated') then
    create trigger trg_cbl_clients_updated before update on public.cbl_clients
      for each row execute function public.cbl_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_cbl_routes_updated') then
    create trigger trg_cbl_routes_updated before update on public.cbl_routes
      for each row execute function public.cbl_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_cbl_trips_updated') then
    create trigger trg_cbl_trips_updated before update on public.cbl_trips
      for each row execute function public.cbl_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_cbl_attendances_updated') then
    create trigger trg_cbl_attendances_updated before update on public.cbl_attendances
      for each row execute function public.cbl_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_cbl_site_settings_updated') then
    create trigger trg_cbl_site_settings_updated before update on public.cbl_site_settings
      for each row execute function public.cbl_set_updated_at();
  end if;
end$$;

-- ============================================================================
-- RLS 預設全部關閉 (Service Role 完全存取, anon 全部拒絕)
-- 開發階段: 你可以暫時 enable RLS + open policy 來測試
-- 上線前: 為每個 role 寫 policy (見 README 結尾)
-- ============================================================================
alter table public.cbl_clients             enable row level security;
alter table public.cbl_users               enable row level security;
alter table public.cbl_drivers             enable row level security;
alter table public.cbl_buses               enable row level security;
alter table public.cbl_parents             enable row level security;
alter table public.cbl_students            enable row level security;
alter table public.cbl_nannies             enable row level security;
alter table public.cbl_routes              enable row level security;
alter table public.cbl_trips               enable row level security;
alter table public.cbl_attendances         enable row level security;
alter table public.cbl_announcements       enable row level security;
alter table public.cbl_announcement_reads  enable row level security;
alter table public.cbl_site_settings       enable row level security;

-- 開發用: 允許 anon 讀寫 (生產前一定要移除)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbl_clients' and policyname = 'dev_allow_all'
  ) then
    create policy dev_allow_all on public.cbl_clients
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_users
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_drivers
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_buses
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_parents
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_students
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_nannies
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_routes
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_trips
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_attendances
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_announcements
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_announcement_reads
      for all using (true) with check (true);
    create policy dev_allow_all on public.cbl_site_settings
      for all using (true) with check (true);
  end if;
end$$;

-- ============================================================================
-- 完成
-- ============================================================================
-- 跑完後可以 SELECT 驗證:
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name like 'cbl_%'
--   order by table_name;
-- 預期看到 13 張 table。
