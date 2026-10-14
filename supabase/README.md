# Supabase Setup — CloudBusLink

> Supabase project: `ytpbbqlgbgfjloqislbh` (https://ytpbbqlgbgfjloqislbh.supabase.co)

## 📁 這個資料夾

```
supabase/
├── migrations/
│   ├── 0001_init.sql      ← 第一次跑這個 (idempotent, 可重複執行)
│   └── 0002_verify.sql    ← 跑完 0001 之後驗證, 或重置用
└── seed/                  ← (預留) 之後放 demo 資料
```

## 🚀 第一次設定 — 5 步驟

### Step 1: 開啟 Supabase SQL Editor

打開 → https://supabase.com/dashboard/project/ytpbbqlgbgfjloqislbh/sql/new

### Step 2: 執行初始 migration

打開 `supabase/migrations/0001_init.sql`, **Ctrl+A 全選**, 貼到 SQL Editor, 按 **Run** (或 `Ctrl+Enter`).

預期看到:
- ✅ "Success. No rows returned" (或類似的成功訊息)
- ❌ 如果有紅字, 整段 rollback, 截圖給我

### Step 3: 驗證 tables

打開 `supabase/migrations/0002_verify.sql`, 貼到 SQL Editor 跑一次.

預期看到 **13 張 cbl_ tables**:
- `cbl_announcement_reads`
- `cbl_announcements`
- `cbl_attendances`
- `cbl_buses`
- `cbl_clients`
- `cbl_drivers`
- `cbl_nannies`
- `cbl_parents`
- `cbl_routes`
- `cbl_site_settings`
- `cbl_students`
- `cbl_trips`
- `cbl_users`

### Step 4: 確認 `.env.local`

確認 `c:\Users\User\Desktop\Bus 9.0\.env.local` 裡這 3 個 key 都有:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ytpbbqlgbgfjloqislbh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<從 dashboard 拿>
SUPABASE_SERVICE_ROLE_KEY=<從 dashboard 拿, 別外洩>
```

### Step 5: 確認 Vercel env

到 Vercel → Project → Settings → Environment Variables, 加這 3 個, **Production / Preview / Development 三個環境都勾**:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ytpbbqlgbgfjloqislbh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | (service_role key) |

存完後 Vercel 會要你 Redeploy 才生效.

## ⚠️ 安全注意

1. **service_role key 有完整 RLS bypass 權限** — 千萬不要加 `NEXT_PUBLIC_` 前綴, 千萬不要 commit 到 git, 千萬不要貼到對話
2. 如果金鑰已經在對話中明文出現過 → 到 Supabase Dashboard → Settings → API → "Roll service_role JWT secret" 換新
3. **生產上線前** 一定要移除 `dev_allow_all` policy, 改寫 per-role policy (super_admin / client / parent / nanny)

## 🗑 想重來?

打開 `0002_verify.sql`, 取消最下面 DANGER 區塊的註解, 跑一次會把 13 張 table 全部 drop 掉, 再重跑 `0001_init.sql` 即可.

## 🔄 之後改 schema

1. 新建 `supabase/migrations/0003_xxx.sql` (不要改 0001)
2. 寫 idempotent SQL (用 `if exists` / `if not exists`)
3. 到 Supabase SQL Editor 跑
4. 跑完同步改 `lib/types.ts` (反之亦然)
