-- ============================================================================
-- 0009 — 補齊 cbl_nannies.description 欄位
--
-- 背景 (bug fix):
--   保姆管理頁 (NannysConsoleContent) 的儲存 patch 裡帶有 `description` 欄位
--   (UI 加的「備註 / 自我介紹」), 但 live DB 的 cbl_nannies 沒有這一欄。
--
--   PostgREST 在 UPDATE 時遇到 payload 裡有 schema 沒有的欄位,
--   會讓「整筆 update」直接失敗 (不是只忽略那一欄) — 錯誤碼 PGRST204:
--     "Could not find the 'description' column of 'cbl_nannies' in the schema cache"
--
--   結果: 同一個 patch 裡的 `assigned_bus_ids` (校巴綁定) 也跟著沒寫進去。
--         → 保姆在「保姆管理頁」綁了校巴, 雲端卻沒有
--         → 路線頁讀到雲端資料 → 「綁定校巴」選完後「跟車保姆」永遠是空白。
--
-- 本次遷移做兩件事:
--   1. 補上 description 欄位 (讓備註真的存得下來)
--   2. 補齊已存在但綁定欄位為空的既有資料 (從 cbl_routes 反推, 見下方 UPDATE)
--
-- 註: 程式碼端 (lib/supabase-entities.ts) 也已加上「未知欄位降級重試」,
--     所以即使未跑本 migration, 其他欄位仍能正常寫入 (不會整筆失敗)。
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- Idempotent: 可重複跑。
-- ============================================================================

-- 1) 補上 description 欄位
do $$
begin
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='cbl_nannies' and column_name='description') then
    alter table public.cbl_nannies
      add column description text default '';
  end if;
end$$;

comment on column public.cbl_nannies.description is '保姆備註 / 自我介紹 (選填) — UI 加的輕量欄位';

-- 2) 補齊既有資料: 從 cbl_routes 反推「這台車當初綁了誰」
--
--    背景: 有些路線已指派 nanny_id, 但該保姆的 assigned_bus_ids 沒有包含
--    這台車 (因為早期「校巴管理頁」選了保姆卻沒寫回 assignedBusIds)。
--    這裡用 cbl_routes 的 (bus_id, nanny_id) 把關係補回來, 讓路線頁能帶出保姆。
do $$
begin
  if exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='cbl_routes' and column_name='nanny_id')
     and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='cbl_routes' and column_name='bus_id') then

    update public.cbl_nannies n
       set assigned_bus_ids = coalesce((
             -- 合併 (union): 保留原本已有的 + 從 routes 反推回來的, 去重
             -- 注意: 不能直接 set = (select array_agg(...) from routes ...),
             -- 那樣會把原本已有的洗掉; 且 array_agg 無列時回傳 NULL 會清空欄位。
             select array_agg(distinct x.bus_id)
               from unnest(
                 coalesce(n.assigned_bus_ids, '{}'::text[])
                 || coalesce((
                      select array_agg(distinct r.bus_id)
                        from public.cbl_routes r
                       where r.nanny_id = n.id
                         and r.bus_id is not null
                    ), '{}'::text[])
               ) as x(bus_id)
         ), '{}'::text[])
     where n.id in (
           select distinct r.nanny_id
             from public.cbl_routes r
            where r.nanny_id is not null
              and r.bus_id is not null
         )
       and exists (
             select 1 from public.cbl_routes r
              where r.nanny_id = n.id
                and r.bus_id is not null
                and not (r.bus_id = any(coalesce(n.assigned_bus_ids, '{}'::text[])))
         );
  end if;
end$$;

-- 驗證:
--   select id, name, assigned_bus_ids, description from public.cbl_nannies;
--   select id, code, bus_id, nanny_id from public.cbl_routes;
