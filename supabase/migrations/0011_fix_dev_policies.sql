-- ============================================================================
-- 0011 — 修復 dev_allow_all 政策缺失 (RLS 靜默拒絕)
--
-- 背景:
--   0001_init.sql 的 DO block 只檢查 cbl_clients 有沒有 dev_allow_all,
--   有就跳過「全部表」的建立。這導致:
--     - 若某張表 (e.g. cbl_drivers / cbl_buses) 的 policy 被手動刪掉,
--       重跑 0001 也不會補回來;
--     - 後加的表若對應 migration 沒跑到, 也會缺 policy。
--   缺 policy + RLS enabled = anon key 的 insert/update 回傳成功
--   但實際沒寫進去 (程式碼的 verify select 抓到 → 右上 toast 顯示 RLS 拒絕)。
--
-- 本 migration: 對所有 public.cbl_% 表逐張檢查, 缺 dev_allow_all 就補上。
-- Idempotent: 可重複跑。
-- 執行位置: Supabase Dashboard → SQL Editor → New query, 貼上整份執行。
-- ============================================================================

-- 1) 確保所有 cbl_% 表都開了 RLS
do $$
declare r record;
begin
  for r in select tablename from pg_tables
           where schemaname = 'public' and tablename like 'cbl_%' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end$$;

-- 2) 缺 dev_allow_all 的表逐張補上 (開發階段: anon 可讀寫, 上線前收緊)
do $$
declare r record;
begin
  for r in select tablename from pg_tables
           where schemaname = 'public' and tablename like 'cbl_%' loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = r.tablename
        and policyname = 'dev_allow_all'
    ) then
      execute format(
        'create policy dev_allow_all on public.%I for all using (true) with check (true)',
        r.tablename
      );
      raise notice 'created dev_allow_all on %', r.tablename;
    end if;
  end loop;
end$$;

-- 驗證 (應每張 cbl_% 表都有一列 dev_allow_all):
--   select tablename, policyname, cmd
--   from pg_policies
--   where schemaname = 'public' and tablename like 'cbl_%'
--   order by tablename;
