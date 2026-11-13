-- ============================================================================
-- 0018 — 回填 academic_year / person_key / 班次快照
--
-- 前提: 已先跑完 0016 + 0017。
--
-- ⚠️ 為什麼 0017 用 DEFAULT '2627' 而不是 NOT NULL 無 default:
--   0017 加上欄位的瞬間, 舊列會自動是 '2627' (DEFAULT)。
--   本 migration 負責「更精確地」改寫那些能推導出正確學年的列。
--   推導不出來的維持 '2627' (安全的預設值), 稍後由 UI 手動調整。
--
-- 學年推導優先順序 (entity 各自不同):
--   cbl_students      → student_id 前綴 (stu-2627001 → '2627')  ← 最可靠
--   cbl_routes        → code 前綴 (2627-001AM → '2627')
--   cbl_trips         → date 落在哪個學年區間 (fallback: client 的現行學年)
--   cbl_announcements → client 的現行學年 (公告沒有編號前綴)
--
-- 為什麼 trips 用 date 推導而不是「client 現行學年」:
--   班次有 date, date 落在哪個學年區間是最直接的訊號。
--   但 0016 建立 cbl_academic_years 時沒有填 start_date/end_date (nullable),
--   所以這裡用「從學年代碼推出的自然區間」當 fallback:
--     2627 → 2026-09-01 ~ 2027-08-31 (8 月底完結, 香港學制慣例)
--   若 date 不在任何已知區間 → 用 client 的現行學年。
--
-- 為什麼 person_key 用「啟發式」而不是精確對應:
--   (決策 D3 已確認接受此啟發式)
--   同一學生每學年被複製成新列 → 需要一個跨學年穩定的識別碼。
--   推導方式: 同一 client 內, (name + date_of_birth + phone) 完全相同
--   且已存在 student_id 前綴不同的列 → 視為同一人 → 共用同一 person_key。
--   ⚠️ 這是「疑似同一人」的推論, 可能誤合 (同名同生日的兄弟姊妹),
--      但比完全沒有識別碼好; 之後可在 UI 手動拆分/合併。
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- Idempotent: 可重複跑 (person_key 用 deterministic 產生方式)。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) 找出每個 client 的「現行學年」, 供後續 fallback 使用
-- ---------------------------------------------------------------------------
create temporary table _tmp_current_year on commit drop as
select
  client_id,
  coalesce(
    (select academic_year from public.cbl_academic_years
      where client_id = c.client_id and is_current limit 1),
    '2627'
  ) as academic_year
from public.cbl_clients c;

-- ---------------------------------------------------------------------------
-- 2) cbl_students.academic_year ← student_id 前綴
--    stu-2627001 → '2627'
-- ---------------------------------------------------------------------------
update public.cbl_students s
set academic_year = substring(s.student_id from '^stu-([0-9]{4})')
where s.student_id ~ '^stu-[0-9]{4}'
  and s.academic_year is distinct from substring(s.student_id from '^stu-([0-9]{4})');

-- ---------------------------------------------------------------------------
-- 3) cbl_routes.academic_year ← code 前綴
--    2627-001AM → '2627'
-- ---------------------------------------------------------------------------
update public.cbl_routes r
set academic_year = substring(r.code from '^([0-9]{4})-')
where r.code ~ '^[0-9]{4}-'
  and r.academic_year is distinct from substring(r.code from '^([0-9]{4})-');

-- ---------------------------------------------------------------------------
-- 4) cbl_trips.academic_year ← date 推導, fallback 到 client 現行學年
--
--    學年區間 (香港學制): 9 月 1 日 ~ 次年 8 月 31 日
--      2627 → 2026-09-01 ~ 2027-08-31
--      2728 → 2027-09-01 ~ 2028-08-31
-- ---------------------------------------------------------------------------
update public.cbl_trips t
set academic_year = coalesce(
  (select y.academic_year
     from public.cbl_academic_years y
    where y.client_id = t.client_id
      and t.date >= make_date((substring(y.academic_year,1,2))::int + 2000, 9, 1)
      and t.date <= make_date((substring(y.academic_year,3,2))::int + 2000, 8, 31)
    limit 1),
  (select academic_year from _tmp_current_year where client_id = t.client_id),
  '2627'
)
where t.academic_year is distinct from coalesce(
  (select y.academic_year
     from public.cbl_academic_years y
    where y.client_id = t.client_id
      and t.date >= make_date((substring(y.academic_year,1,2))::int + 2000, 9, 1)
      and t.date <= make_date((substring(y.academic_year,3,2))::int + 2000, 8, 31)
    limit 1),
  (select academic_year from _tmp_current_year where client_id = t.client_id),
  '2627'
);

-- ---------------------------------------------------------------------------
-- 5) cbl_announcements.academic_year ← client 現行學年
--    (公告沒有編號前綴, 這是唯一合理推導)
-- ---------------------------------------------------------------------------
update public.cbl_announcements a
set academic_year = coalesce(
  (select academic_year from _tmp_current_year where client_id = a.client_id),
  '2627'
)
where a.academic_year is distinct from coalesce(
  (select academic_year from _tmp_current_year where client_id = a.client_id),
  '2627'
);

-- ---------------------------------------------------------------------------
-- 6) cbl_students.person_key ← 啟發式 (name + dob + phone)
--
--    同一 client 內, (name, date_of_birth, phone) 相同 → 同一 person_key。
--    person_key 格式: 'pk-<clientId>-<md5前12碼>' (deterministic → 可重複跑)
--
--    ⚠️ 為什麼這裡用 md5 而應用層用隨機值:
--       這兩邊「不會需要算出同樣的值」——
--       0018 負責「既有資料一次性回填」, 之後這個欄位就固定不再重算;
--       應用層只負責「新建立的學生」, 用隨機唯一值即可。
--       跨學年的連續性靠「複製流程沿用既有 personKey」維持 (M2), 不靠重新推導。
--       → 所以兩邊的演算法不需要一致, 也就不會有「一邊算 md5 一邊算別的」的風險。
--
--    ⚠️ 只在「同一組鍵對應到多個不同 student_id 前綴」時才需要串接;
--       單一學年內的學生各自也有 person_key (一人一碼), 這樣之後
--       複製到新學年時直接沿用。
-- ---------------------------------------------------------------------------
update public.cbl_students s
set person_key = 'pk-' || s.client_id || '-' || substr(
  md5(
    lower(coalesce(s.name, '')) || '|' ||
    coalesce(s.date_of_birth::text, '') || '|' ||
    coalesce(s.phone, '')
  ), 1, 12
)
where s.person_key is null
  -- 避免把「完全空白」的鍵也算成一個人
  and (coalesce(s.name, '') <> '' or coalesce(s.phone, '') <> '');

-- ---------------------------------------------------------------------------
-- 7) cbl_trips 司機/車牌快照 ← 由校巴目前的綁定回填
--
--    這只能回填「當下的綁定」, 對 26-27 的歷史班次來說,
--    若當年曾換過司機, 回填值可能不是當時真正的司機。
--    ⚠️ 這是既有資料的先天限制 — 未來新建的班次才是準的 (M2 會在建立時蓋章)。
--    回填的價值在於: 從今往後校巴換司機時, 舊班次仍顯示快照值而非新司機。
-- ---------------------------------------------------------------------------
update public.cbl_trips t
set
  driver_id_snapshot = coalesce(t.driver_id_snapshot, b.driver_id),
  bus_plate_number_snapshot = coalesce(t.bus_plate_number_snapshot, b.plate_number)
from public.cbl_buses b
where b.id = t.bus_id
  and (t.driver_id_snapshot is null or t.bus_plate_number_snapshot is null);

-- ---------------------------------------------------------------------------
-- 8) 清理 temporary table
-- ---------------------------------------------------------------------------
drop table if exists _tmp_current_year;

-- ============================================================================
-- 驗證查詢 (建議逐一跑過, 確認結果符合預期)
-- ============================================================================

-- V1) 每張表的學年分佈 — 應該只看到 '2627' (除非你已有其他學年的資料)
-- select 'students' t, academic_year, count(*) from cbl_students group by 2
-- union all select 'routes', academic_year, count(*) from cbl_routes group by 2
-- union all select 'trips', academic_year, count(*) from cbl_trips group by 2
-- union all select 'announcements', academic_year, count(*) from cbl_announcements group by 2
-- order by 1, 2;

-- V2) 不應有 NULL — 應該回傳 0 列
-- select 'students' t, count(*) from cbl_students where academic_year is null
-- union all select 'routes', count(*) from cbl_routes where academic_year is null
-- union all select 'trips', count(*) from cbl_trips where academic_year is null
-- union all select 'announcements', count(*) from cbl_announcements where academic_year is null;

-- V3) 學年應與編號前綴一致 — 應該回傳 0 列
-- select id, student_id, academic_year from cbl_students
-- where student_id ~ '^stu-[0-9]{4}'
--   and substring(student_id from '^stu-([0-9]{4})') is distinct from academic_year;

-- V4) person_key 覆蓋率
-- select count(*) total, count(person_key) with_key from cbl_students;

-- V5) 同一 person_key 對應到幾個學年 (應該 >1 = 該學生已跨學年存在)
-- select client_id, person_key, count(*) rows, count(distinct academic_year) years
-- from cbl_students where person_key is not null
-- group by 1,2 having count(distinct academic_year) > 1 order by 3 desc;

-- V6) 班次快照覆蓋率 — 應該 total = with_snapshot
-- select count(*) total, count(driver_id_snapshot) drv, count(bus_plate_number_snapshot) plate
-- from cbl_trips;

-- V7) 每個 client 只應有一筆 is_current
-- select client_id, count(*) from cbl_academic_years
-- where is_current group by 1 having count(*) > 1;
-- ============================================================================
