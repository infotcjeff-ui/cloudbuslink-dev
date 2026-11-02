// ============================================================================
//  client_id 的 FK 安全解析 (共用)
// ============================================================================
//
//  【這是「家長已新增，但插入帳密到雲端失敗」的根因】
//
//  cbl_users / cbl_parents / cbl_students / cbl_nannies / cbl_buses /
//  cbl_drivers / cbl_routes / cbl_trips 的 client_id 都 FK → cbl_clients(id)。
//
//  只要 client_id 指向一個「雲端不存在的 row」(最常見的是空字串 ''),
//  PostgREST 就會回 23503:
//    insert or update on table "cbl_users" violates foreign key
//    constraint "cbl_users_client_id_fkey"
//  → 整筆 insert 失敗 → 本機有、雲端沒有 → 下次 sync 又被洗掉 (帳號憑空消失)。
//
//  空字串從哪裡來?
//    1. lib/storage.ts 的 resolveClientId() 在「還沒對應到任何學校」時回傳 ''。
//       跨機構角色 (super_admin / system_admin) 本身沒有 clientId,
//       若 localStorage 的 cbl_clients 尚未同步回來 → resolveClientId() 回 ''。
//    2. 本機的 clientId 可能是「舊的 / 不同步的 id」 (換過 project、舊 demo id),
//       同樣會撞 FK。
//
//  這層的定位: 寫入前的最後一道保險 (不取代 UI 端的 resolveClientId)。
//    - client_id NOT NULL 的表 (parents/students/nannies/buses/drivers/routes/trips)
//      → 對齊到雲端真的存在的學校; 雲端一間都沒有 → 回報明確錯誤 (不靜默寫壞資料)
//    - client_id 可為 NULL 的表 (cbl_users)
//      → 對齊不到就寫 null (絕不寫 '')
//
//  ⚠️ 為什麼要保留「刻意給 null」的語意?
//     cbl_users.client_id 可空, 而 system_admin / super_admin 帳號「刻意不屬於
//     任何學校」→ 呼叫端傳 null 時, 這裡必須保留 null, 不能自作主張指派到第一間
//     學校 (那會讓平台帳號看起來像某間學校的老師)。
//     所以: null/undefined = 刻意不要學校; '' = 沒指定 → 兜底到第一間學校。
// ============================================================================

/** 查詢某個 id 在雲端 cbl_clients 是否真的存在 */
async function cloudClientExists(id: string): Promise<boolean> {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_clients')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch (e) {
    console.warn('[Supabase] cloudClientExists failed:', e);
    return false;
  }
}

/** 雲端第一間學校 (沒有的話回傳 null) */
async function firstCloudClientId(): Promise<string | null> {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('cbl_clients')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('[Supabase] firstCloudClientId failed:', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.warn('[Supabase] firstCloudClientId failed:', e);
    return null;
  }
}

/**
 * 解析一個「雲端真的存在的」cbl_clients.id。
 *
 * 處置順序:
 *   1. preferred 是 null / undefined → 回傳 null
 *      (呼叫端「刻意不要學校」, 例如 system_admin 帳號 —— 必須保留原意)
 *   2. preferred 是空字串 → 雲端第一間學校
 *      (跨機構角色建立資料時的兜底; 空字串本身一定撞 FK)
 *   3. preferred 雲端存在 → 用它
 *   4. preferred 雲端不存在 (舊 id / 換過 project) → 雲端第一間學校
 *
 * @returns 雲端真的存在的 client id, 或 null (刻意不屬於任何學校 / 雲端沒學校)
 */
export async function resolveCloudClientId(
  preferred?: string | null,
): Promise<string | null> {
  if (preferred === null || preferred === undefined) return null;

  const trimmed = String(preferred).trim();
  if (!trimmed) return firstCloudClientId();

  if (await cloudClientExists(trimmed)) return trimmed;

  // 本機的 id 雲端沒有 → 對齊到雲端第一間學校
  const fallback = await firstCloudClientId();
  if (fallback && fallback !== trimmed) {
    console.warn(
      `[Supabase] client_id "${trimmed}" 在雲端不存在, 已對齊到 "${fallback}"`,
    );
  }
  return fallback;
}

/**
 * client_id NOT NULL 的表用 — 保證拿到一個雲端真的存在的 id。
 *
 * ⚠️ 雲端一間學校都沒有時回傳 '' —— 呼叫端必須據此回報明確錯誤
 *    (直接寫 '' 進 DB 只會得到一句難懂的 FK violation)。
 */
export async function requireCloudClientId(preferred?: string | null): Promise<string> {
  const id = await resolveCloudClientId(preferred);
  if (id) return id;
  // preferred 是 null 的情況 (NOT NULL 表不適用, 但保險起見再試一次第一間學校)
  return (await firstCloudClientId()) ?? '';
}

/**
 * client_id 可為 NULL 的表用 (cbl_users) — 對齊不到就 null (絕不寫 '')。
 */
export async function resolveNullableClientId(
  preferred?: string | null,
): Promise<string | null> {
  return resolveCloudClientId(preferred);
}

/**
 * 把 payload 裡的 client_id 對齊到雲端真的存在的 id (in-place)。
 *
 * @param payload 含 client_id 的 snake_case payload
 * @param opts.allowNull true = 該欄位可為 NULL (cbl_users)
 *                      false = NOT NULL, 對齊不到就清成 '' (讓呼叫端回報明確錯誤)
 */
export async function alignPayloadClientId(
  payload: Record<string, unknown>,
  opts: { allowNull?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (!('client_id' in payload)) return payload;

  const current = payload.client_id as string | null | undefined;

  if (opts.allowNull) {
    payload.client_id = await resolveNullableClientId(current);
  } else {
    payload.client_id = await requireCloudClientId(current);
  }
  return payload;
}
