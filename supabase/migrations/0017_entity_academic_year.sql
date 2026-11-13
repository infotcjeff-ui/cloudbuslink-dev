-- ============================================================================
-- 0017 — entity 加 academic_year + 班次司機快照
--
-- 背景:
--   0016 建立了 cbl_academic_years 登錄表, 但資料本身還沒有學年邊界。
--   這一份 migration 把「學年」加到真正會跨年累積的資料表上。
--
-- 分學年 vs 不分學年 (決策 D2 — 混合制):
--   分:   cbl_students / cbl_routes / cbl_trips / cbl_announcements
--   不分: cbl_parents / cbl_nannies / cbl_buses / cbl_drivers
--         (人、員工、車輛是「實體」, 會跨年延續; 就讀紀錄與排班是「期間紀錄」)
--   cbl_attendances 不加欄位 → 由 trip_id → cbl_trips.academic_year 推導即可。
--
-- ⚠️ 為什麼全部帶 DEFAULT:
--   舊的 insert (還沒改程式碼的) 會自動填 '2627' → 不會因為少了 NOT NULL 欄位而失敗。
--   這讓 0017 可以先於程式改動上線, 資料不會卡住。
--
-- ⚠️ 為什麼 cbl_students 要加 person_key:
--   決策 D3: 學生每學年複製成新列 (因為 unique(client_id, student_id) 且
--   student_id 含學年前綴 → 同一學生無法沿用同一列)。
--   這會讓「同一個人」在系統裡有多列 → 需要一個跨學年穩定的識別碼。
--   person_key 就是那個識別碼: 複製時沿用同一值。
--   設計為 nullable → 既有資料可先留 null, 之後由 0018 回填或人工指定。
--
-- ⚠️ 為什麼 cbl_trips 要加司機/車牌快照:
--   決策「陷阱 01」: joinTripRelationsWithMaps 是「現算」的 (bus?.driverId),
--   沒有快照。27-28 換了司機 → 回頭看 26-27 的班次會顯示錯的人。
--   「隨時查看舊資料」這件事在內容上就不成立。
--   → 建班當下把司機與車牌寫死進班次, 歷史班次才忠實。
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- Idempotent: 可重複跑。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) cbl_students — academic_year + person_key
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cbl_students'
      and column_name = 'academic_year'
  ) then
    alter table public.cbl_students
      add column academic_year text not null default '2627';
    comment on column public.cbl_students.academic_year is
      '就讀學年 (4 位 code, 例 2627 = 2026/27)。每學年一份就讀紀錄 — 同一人在不同學年是不同的列。';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cbl_students'
      and column_name = 'person_key'
  ) then
    alter table public.cbl_students
      add column person_key text;
    comment on column public.cbl_students.person_key is
      '跨學年延續識別碼 — 同一學生每學年被複製成新列時沿用同一值。null = 未指定 (可事後回填)。';
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2) cbl_routes — academic_year
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cbl_routes'
      and column_name = 'academic_year'
  ) then
    alter table public.cbl_routes
      add column academic_year text not null default '2627';
    comment on column public.cbl_routes.academic_year is
      '路線模板所屬學年 (4 位 code)。路線編號已含學年前綴 (2627-001AM), 此欄供結構化查詢。';
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 3) cbl_trips — academic_year + 司機/車牌快照
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cbl_trips'
      and column_name = 'academic_year'
  ) then
    alter table public.cbl_trips
      add column academic_year text not null default '2627';
    comment on column public.cbl_trips.academic_year is
      '班次所屬學年 (4 位 code)。由建立當下的「作用中學年」蓋章, 不從 date 反推。';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cbl_trips'
      and column_name = 'driver_id_snapshot'
  ) then
    alter table public.cbl_trips
      add column driver_id_snapshot text;
    comment on column public.cbl_trips.driver_id_snapshot is
      '建班當下的司機 id 快照 — 不隨校巴日後改綁而變, 確保歷史班次顯示正確的司機。';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cbl_trips'
      and column_name = 'bus_plate_number_snapshot'
  ) then
    alter table public.cbl_trips
      add column bus_plate_number_snapshot text;
    comment on column public.cbl_trips.bus_plate_number_snapshot is
      '建班當下的車牌快照 — 校巴換車牌或退役後, 歷史班次仍顯示當時的車牌。';
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 4) cbl_announcements — academic_year
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cbl_announcements'
      and column_name = 'academic_year'
  ) then
    alter table public.cbl_announcements
      add column academic_year text not null default '2627';
    comment on column public.cbl_announcements.academic_year is
      '公告所屬學年 (4 位 code)。範本 (is_template=true) 不受此限 — 範本跨學年沿用。';
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 5) Index
-- ---------------------------------------------------------------------------

-- 學年化 entity 的主要存取模式: 「某 client 的某學年」
create index if not exists idx_cbl_students_client_year
  on public.cbl_students (client_id, academic_year);

create index if not exists idx_cbl_routes_client_year
  on public.cbl_routes (client_id, academic_year);

-- 班次最常見的查詢: 「某 client 的某學年 + 日期範圍」
create index if not exists idx_cbl_trips_client_year_date
  on public.cbl_trips (client_id, academic_year, date);

create index if not exists idx_cbl_announcements_client_year
  on public.cbl_announcements (client_id, academic_year);

-- person_key 查詢 (跨學年找同一個人)
create index if not exists idx_cbl_students_person_key
  on public.cbl_students (client_id, person_key)
  where person_key is not null;

-- ---------------------------------------------------------------------------
-- 驗證:
--   select table_name, column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name in ('cbl_students','cbl_routes','cbl_trips','cbl_announcements')
--     and column_name in ('academic_year','person_key','driver_id_snapshot','bus_plate_number_snapshot')
--   order by table_name, column_name;
--
--   -- 應該全部都是 NOT NULL + default '2627' (除了 person_key 與兩個 snapshot)
-- ============================================================================
