-- ============================================================================
-- 0025 — server-only 密鑰持久化 (cbl_server_secrets)
--
-- 背景:
--   /api/system-admin/secrets 以前把 808 GPS 帳密 / API Key 寫進
--   data/system-secrets.json。Vercel serverless 的檔案系統是 ephemeral
--   (寫完下一個請求 / 重新部署就丟失) → 線上存完一 reload 就變空白。
--   改為寫 Supabase, 由 service_role 直連讀寫 (繞過 RLS)。
--
-- 安全:
--   - RLS 開啟, 且加一條 RESTRICTIVE block_anon (anon 讀寫一律 false)。
--     就算有人重跑 0011 補上 dev_allow_all, restrictive policy 依然擋死 anon。
--   - service_role 繞過 RLS, 正常讀寫。前端永遠只經 /api 拿遮罩, 無明文。
--
-- 執行位置: Supabase Dashboard → SQL Editor → New query, 貼上整份執行。
-- Idempotent: 可重複跑。
-- ============================================================================

create table if not exists public.cbl_server_secrets (
  id            text primary key,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.cbl_server_secrets is 'Server-only 密鑰 (808 GPS 帳密 / API Key)。只准 service_role 經後端讀寫, anon 零權限。前端永遠只拿遮罩。';

alter table public.cbl_server_secrets enable row level security;

-- anon 徹底封死 (restrictive: 就算有其他 permissive policy 也必須同時通過此條)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbl_server_secrets' and policyname = 'block_anon'
  ) then
    create policy block_anon on public.cbl_server_secrets
      as restrictive for all to anon using (false) with check (false);
  end if;
end$$;

-- updated_at trigger (沿用 cbl_set_updated_at, 若存在)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'cbl_set_updated_at') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_cbl_server_secrets_updated') then
      create trigger trg_cbl_server_secrets_updated before update on public.cbl_server_secrets
        for each row execute function public.cbl_set_updated_at();
    end if;
  end if;
end$$;

-- 初始列 (空的, 讓 API 讀得到而不是每次 upsert)
insert into public.cbl_server_secrets (id, data)
values ('global', '{}'::jsonb)
on conflict (id) do nothing;

-- 驗證:
--   select id, data, updated_at from public.cbl_server_secrets;
--   select policyname, roles, cmd from pg_policies where tablename = 'cbl_server_secrets';
--   (anon 用戶 select 應回 0 列 / 報 RLS 拒絕; service_role 可讀寫)
