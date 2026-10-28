-- ============================================================================
-- 0005 — cbl_trips.route_id (班次引用路線模板)
--
-- 背景:
--   /cbl-admin-setting/bus/trips 維護的是「路線模板」(cbl_routes):
--   有站點順序、ETA、起終點、對應學生, 可拖曳排序 / 一鍵反轉 / 地圖預覽。
--   而 /cbl-admin-setting/schedule 維護的是「班次」(cbl_trips):
--   waypoints 反而是從學生的 pickupLocation / dropoffLocation 自動聚合出來的。
--
--   兩套站點模型互不相通, 導致路線頁投入的心血對班次毫無影響。
--   本 migration 讓 Trip 可以引用 Route ——
--   Route 當模板, 建立班次時「套用路線」把 stops 複製成當日 waypoints (可微調),
--   trip.routeId 記錄來源, 方便回溯「這班是照哪條路線開的」。
--
-- 設計:
--   - route_id nullable: 舊班次 / 手動建立的班次可以沒有對應路線 (不強制回填)
--   - FK on delete set null: 路線被刪掉時班次仍要存在, 只是失去模板來源
--     (班次的 waypoints 已經是當日快照, 不會被連鎖刪除)
--   - 額外索引: 依 routeId 查詢「這條路線開了哪些班次」
--
-- 本 migration 是 idempotent (可重複執行)。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 加欄位 (若不存在)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cbl_trips'
      and column_name = 'route_id'
  ) then
    alter table public.cbl_trips
      add column route_id text references public.cbl_routes(id) on delete set null;

    comment on column public.cbl_trips.route_id is
      '本班次套用的路線模板 id (cbl_routes.id) — Route 為模板, Trip.waypoints 為當日快照; null = 手動建立';
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. 索引 (若不存在)
-- ---------------------------------------------------------------------------
create index if not exists idx_cbl_trips_route
  on public.cbl_trips (route_id);

-- ---------------------------------------------------------------------------
-- 3. 回填 (best effort)
--   舊資料沒有 routeId, 用「同 client + 同 shift_type + 同 bus」去猜最接近的一條路線。
--   僅在「該 (client, shift_type, bus) 剛好只有一條路線」時回填 ——
--   歧義時寧可留 null, 也不要猜錯 (猜錯會讓管理員在 UI 看到錯誤的路線來源)。
-- ---------------------------------------------------------------------------
do $$
begin
  update public.cbl_trips t
  set route_id = r.id
  from (
    select client_id,
           bus_id,
           shift_type,
           min(id) as route_id,
           count(*) as cnt
    from public.cbl_routes
    where bus_id is not null
    group by client_id, bus_id, shift_type
  ) r
  where t.route_id is null
    and t.bus_id = r.bus_id
    and t.client_id = r.client_id
    and r.cnt = 1
    -- Trip.type 對應 Route.shiftType: morning->morning, afternoon->afternoon,
    -- custom->extracurricular (自訂班次對應課外/臨時線)
    and (
      (t.type = 'morning'     and r.shift_type = 'morning')
      or (t.type = 'afternoon' and r.shift_type = 'afternoon')
      or (t.type = 'custom'    and r.shift_type = 'extracurricular')
    );
end$$;

-- ---------------------------------------------------------------------------
-- 4. 驗證
-- ---------------------------------------------------------------------------
-- select count(*) as trips_with_route
-- from public.cbl_trips where route_id is not null;
--
-- select count(*) as dangling_route_ref
-- from public.cbl_trips t
-- where t.route_id is not null
--   and not exists (select 1 from public.cbl_routes r where r.id = t.route_id);
-- 預期: dangling_route_ref = 0 (FK 已保證)
