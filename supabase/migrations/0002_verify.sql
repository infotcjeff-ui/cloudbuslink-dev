-- ============================================================================
-- CloudBusLink — Verify & Optional Reset
-- 跑完 0001_init.sql 之後, 想看結果就執行這份
--
-- ⚠️ reset_xxx 的 script 會 DROP 對應的 table,請確認你真的要重來
-- ============================================================================

-- [SAFE] 列出所有 cbl- tables + 每張的 row count
select
  table_name,
  (xpath('/row/cnt/text()', xml_count))[1]::text::int as row_count
from (
  select
    table_name,
    query_to_xml(format('select count(*) as cnt from public.%I', table_name), false, true, '') as xml_count
  from information_schema.tables
  where table_schema = 'public' and table_name like 'cbl_%'
  order by table_name
) t;

-- [SAFE] 每張 table 的欄位列表 (確認型別對應 types.ts)
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public' and table_name like 'cbl_%'
order by table_name, ordinal_position;

-- [SAFE] 列出所有 policy
select
  tablename,
  policyname,
  cmd,
  qual
from pg_policies
where schemaname = 'public' and tablename like 'cbl_%'
order by tablename;

-- [DANGER] 完整重置 — 會 drop 所有 cbl- tables, RLS, policies
-- ⚠️ 這會刪除所有資料,只在第一次想重來時用
-- 取消下面的註解再執行:
/*
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' and tablename like 'cbl_%' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
  -- 清掉 RLS policy
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and tablename like 'cbl_%' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
  -- 清掉 trigger function
  execute 'drop function if exists public.cbl_set_updated_at()';
end$$;
*/
