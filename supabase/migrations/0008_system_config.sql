-- ============================================================================
-- 0008 — 平台層設定 (cbl_system_config)
--
-- 用途: /system-admin-setting 讓 system_admin 改 Supabase / GPS 的 key & value。
--       這張表存「平台共用」的非機密設定, 讓換裝置 / 換人也能生效。
--
-- ⚠️ 安全邊界 (重要):
--   - 這張表在開發階段是 anon 可讀 (dev_allow_all), 所以 **絕對不能存 secret**
--   - 可存: supabase.url / supabase.anonKey / gps.provider / gps.endpoint /
--           gps.refresh_seconds
--     (anon key 本來就會 inline 在前端 bundle, 屬於 client-safe)
--   - 不可存: gps.apiKey (第三方 secret) → 只存 localStorage, 永不上雲
--   - service_role key 更是完全不會出現在這裡 (只在 server env)
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query
-- Idempotent: 可重複跑。
-- ============================================================================

-- 1) 建立表 (平台只有一份設定, 所以固定 id = 'global')
create table if not exists public.cbl_system_config (
  id            text primary key,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table  public.cbl_system_config is '平台層設定 — 跨裝置共用。⚠️ 只可存非機密欄位 (anon key / url / provider / endpoint / 頻率); 任何 secret 一律只存 localStorage。';
comment on column public.cbl_system_config.data is '設定內容 jsonb — { supabase: { url, anonKey }, gps: { provider, endpoint, refreshSeconds } }。不可含 apiKey。';

-- 2) updated_at trigger
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_cbl_system_config_updated') then
    create trigger trg_cbl_system_config_updated before update on public.cbl_system_config
      for each row execute function public.cbl_set_updated_at();
  end if;
end$$;

-- 3) RLS + dev policy (與其他 cbl_ 表一致：開發階段 anon 可讀寫, 上線前收緊)
alter table public.cbl_system_config enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbl_system_config' and policyname = 'dev_allow_all'
  ) then
    create policy dev_allow_all on public.cbl_system_config
      for all using (true) with check (true);
  end if;
end$$;

-- 4) 初始列 (空的, 讓 UI 讀得到而不是 404)
insert into public.cbl_system_config (id, data)
values ('global', '{}'::jsonb)
on conflict (id) do nothing;

-- 驗證:
--   select id, data, updated_at from public.cbl_system_config;
--   select * from pg_policies where tablename = 'cbl_system_config';
