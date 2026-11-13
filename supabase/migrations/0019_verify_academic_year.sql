-- ============================================================================
-- 0019 — 學年隔離驗證查詢 (唯讀, 不會改動任何資料)
--
-- 用途: 在 Supabase SQL Editor 執行完 0016 / 0017 / 0018 之後,
--        逐段跑這裡的查詢確認結果符合預期。
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- ⚠️ 全部都是 SELECT — 不會改動資料, 可以放心重複跑。
-- ============================================================================

-- ============================================================================
--  第 1 段: schema 檢查 — 欄位有沒有真的建立起來
-- ============================================================================

-- 1.1) 學年登錄表存在?
--      應該回傳 1 列 (id = 'cbl_academic_years')
select table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'cbl_academic_years';

-- 1.2) 新欄位清單
--      應該回傳 7 列:
--        cbl_announcements.academic_year
--        cbl_routes.academic_year
--        cbl_students.academic_year
--        cbl_students.person_key
--        cbl_trips.academic_year
--        cbl_trips.bus_plate_number_snapshot
--        cbl_trips.driver_id_snapshot
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('cbl_students','cbl_routes','cbl_trips','cbl_announcements')
  and column_name in ('academic_year','person_key','driver_id_snapshot','bus_plate_number_snapshot')
order by table_name, column_name;

-- 1.3) Index 清單
--      應該看到 idx_cbl_academic_years_current (UNIQUE) 以及 5 個 entity index
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and (
    tablename = 'cbl_academic_years'
    or indexname like 'idx_cbl%academic_year%'
    or indexname = 'idx_cbl_students_person_key'
  )
order by tablename, indexname;

-- ============================================================================
--  第 2 段: 學年登錄表內容
-- ============================================================================

-- 2.1) 目前有哪些學年登錄
select client_id, academic_year, label, status, is_current, start_date, end_date
from public.cbl_academic_years
order by client_id, academic_year desc;

-- 2.2) ⚠️ 關鍵檢查: 每個 client 最多一筆 is_current
--      應該回傳 0 列 (partial unique index 保證, 正常情況不可能有結果)
select client_id, count(*) as current_count
from public.cbl_academic_years
where is_current
group by client_id
having count(*) > 1;

-- 2.3) 有沒有 client 完全沒有學年登錄
--      應該回傳 0 列 (0016 已自動為每個 client 補一筆)
select c.id, c.name
from public.cbl_clients c
left join public.cbl_academic_years ay on ay.client_id = c.id
where ay.id is null;

-- ============================================================================
--  第 3 段: entity 的學年分佈
-- ============================================================================

-- 3.1) 各表的學年分佈
--      正常情況下只會看到 '2627' (除非你已有其他學年的資料)
select 'students' as entity, academic_year, count(*) as rows
from public.cbl_students group by academic_year
union all
select 'routes', academic_year, count(*) from public.cbl_routes group by academic_year
union all
select 'trips', academic_year, count(*) from public.cbl_trips group by academic_year
union all
select 'announcements', academic_year, count(*) from public.cbl_announcements group by academic_year
order by 1, 2;

-- 3.2) ⚠️ 應該回傳 0 列 — 不該有 NULL 學年
select 'students' as entity, count(*) as null_rows from public.cbl_students where academic_year is null
union all
select 'routes', count(*) from public.cbl_routes where academic_year is null
union all
select 'trips', count(*) from public.cbl_trips where academic_year is null
union all
select 'announcements', count(*) from public.cbl_announcements where academic_year is null;

-- 3.3) ⚠️ 應該回傳 0 列 — 學年應與學生編號前綴一致
--      (0018 是用 student_id 前綴回填的, 不一致代表有手動改過編號)
select id, student_id, academic_year
from public.cbl_students
where student_id ~ '^stu-[0-9]{4}'
  and substring(student_id from '^stu-([0-9]{4})') is distinct from academic_year;

-- 3.4) ⚠️ 應該回傳 0 列 — 學年應與路線編號前綴一致
select id, code, academic_year
from public.cbl_routes
where code ~ '^[0-9]{4}-'
  and substring(code from '^([0-9]{4})-') is distinct from academic_year;

-- ============================================================================
--  第 4 段: person_key (跨學年學生識別碼)
-- ============================================================================

-- 4.1) person_key 覆蓋率
--      total = with_key + without_key
select count(*) as total,
       count(person_key) as with_key,
       count(*) - count(person_key) as without_key
from public.cbl_students;

-- 4.2) ⚠️ 應該回傳 0 列 — person_key 格式不對
--      格式: 'pk-<clientId>-<12碼 hex>'
select id, person_key
from public.cbl_students
where person_key is not null
  and person_key !~ '^pk-.+-[0-9a-f]{12}$';

-- 4.3) 同一 person_key 對應到幾個學年
--      years > 1 = 該學生已跨學年存在 (這是預期的)
select client_id, person_key,
       count(*) as rows,
       count(distinct academic_year) as years,
       min(academic_year) as first_year,
       max(academic_year) as last_year
from public.cbl_students
where person_key is not null
group by client_id, person_key
having count(distinct academic_year) > 1
order by years desc, client_id
limit 30;

-- 4.4) ⚠️ 疑似誤合檢查 — 同一 person_key 但「姓名或生日不同」
--      這代表啟發式可能把兩個人合併了 (同名同生日的兄弟姊妹)。
--      有結果 → 需要人工檢查 (可以在 UI 手動拆開)。
select person_key,
       count(distinct name) as distinct_names,
       count(distinct date_of_birth) as distinct_dobs,
       string_agg(distinct name, ' | ') as names
from public.cbl_students
where person_key is not null
group by person_key
having count(distinct name) > 1 or count(distinct date_of_birth) > 1
order by person_key
limit 30;

-- ============================================================================
--  第 5 段: 班次快照 (歷史保真)
-- ============================================================================

-- 5.1) 快照覆蓋率
--      total = drv = plate 才算完整 (沒綁司機的校巴會是 NULL, 那是正常的)
select count(*) as total,
       count(driver_id_snapshot) as with_driver,
       count(bus_plate_number_snapshot) as with_plate
from public.cbl_trips;

-- 5.2) ⚠️ 有司機快照但沒車牌快照 (或反之) 的班次
--      應該是少數或 0 — 若有, 代表回填時校巴資料不完整
select id, date, bus_id, driver_id_snapshot, bus_plate_number_snapshot
from public.cbl_trips
where (driver_id_snapshot is null) <> (bus_plate_number_snapshot is null)
limit 30;

-- 5.3) 快照與目前校巴綁定不一致的班次
--      ⚠️ 這不一定是錯 — 校巴改綁司機後, 舊班次保留舊司機才是正確的。
--      但如果數量很多, 代表 0018 回填時用的是「現在的綁定」而非「當時的綁定」
--      (既有資料的先天限制, 未來新建的班次才是準的)。
select count(*) as drifted_trips
from public.cbl_trips t
join public.cbl_buses b on b.id = t.bus_id
where t.driver_id_snapshot is distinct from b.driver_id;

-- ============================================================================
--  第 6 段: 學年與班次日期的一致性 (抽查)
-- ============================================================================

-- 6.1) 班次日期落在哪個學年 — 抽查前 20 筆
--      ⚠️ 學年邊界是「推定」的 (9/1 ~ 8/31)。若你的學校開學日不同,
--         這個結果可能跟實際不符 → 之後在 cbl_academic_years.start_date/end_date
--         設定真實區間即可 (M3 會改成以登錄表為準)。
select t.id, t.date, t.academic_year,
       case when t.date >= make_date(substring(t.academic_year,1,2)::int + 2000, 9, 1)
             and t.date <= make_date(substring(t.academic_year,3,2)::int + 2000, 8, 31)
            then 'OK' else 'OUT-OF-RANGE' end as check_result
from public.cbl_trips t
order by t.date desc
limit 20;

-- ============================================================================
--  第 7 段: 準備 27-28 學年 (下一步操作)
-- ============================================================================
--
-- 當 27-28 開學時, 用這段 SQL 建立新的學年登錄 + 把現行的切過去:
--
--   begin;
--
--   -- 1) 建立 27-28 (upcoming = 即將開始, 可預先建資料但不可開班)
--   insert into public.cbl_academic_years
--     (id, client_id, academic_year, label, status, is_current, start_date, end_date)
--   values
--     ('ay-2728-<你的clientId>', '<你的clientId>', '2728', '2027/28 學年',
--      'upcoming', false, '2027-09-01', '2028-08-31');
--
--   -- 2) 確認 27-28 真的有建立
--   select * from public.cbl_academic_years where academic_year = '2728';
--
--   -- 3) 開學當天 → 把 27-28 設為現行, 26-27 封存
--   --    (partial unique index 會擋住同時有兩筆 is_current, 所以要分兩步)
--   update public.cbl_academic_years set is_current = false
--    where client_id = '<你的clientId>' and is_current;
--
--   update public.cbl_academic_years set is_current = true, status = 'active'
--    where client_id = '<你的clientId>' and academic_year = '2728';
--
--   update public.cbl_academic_years set status = 'archived'
--    where client_id = '<你的clientId>' and academic_year = '2627';
--
--   -- 4) 驗證
--   select academic_year, status, is_current
--    from public.cbl_academic_years
--   where client_id = '<你的clientId>'
--   order by academic_year;
--
--   commit;
--
-- ⚠️ 學年轉換的「學生複製」不在 SQL 裡做 ——
--    那是 M2 的功能 (學年轉換精靈), 會把 26-27 的學生複製成 27-28 的新列
--    (student_id 前綴換成 stu-2728xxx, person_key 沿用),
--    同時把 26-27 的列 status 改成 'graduated'。
--    手動做這件事很危險 (會漏掉 bus_id / parent_ids / pickupLocation 等欄位的處理),
--    所以交給程式做。
-- ============================================================================
