// ============================================================================
//  useAuthClientId — 取得「建立資料時要用的 clientId (所屬學校)」
// ============================================================================
//
//  【為什麼需要這個 hook】
//
//  原本各 console 頁面都自己刻一份:
//
//    const authClientId = React.useMemo(() => {
//      const raw = localStorage.getItem('cbl_auth');
//      const u = JSON.parse(raw);
//      return resolveClientId(u?.clientId || null);
//    }, []);
//
//  這份 useMemo 有兩個問題:
//
//  1. **只在 mount 時算一次**
//     useMemo 的 dependency 是 [] → 永遠不會重算。
//     而 localStorage 的 cbl_clients 是「雲端同步回來之後」才有值的。
//     mount 的時候同步還沒完成 → resolveClientId() 找不到任何已知學校
//     → 回傳 '' → 建立的資料 client_id = '' → 撞 FK → 推不上去。
//
//  2. **讀的是 localStorage 的快照**
//     useMemo 不會因 localStorage 變化而重算, 就算同步回來了也不會更新。
//
//  解法: 改用 state + effect, 並監聽 'cbl-clients-refresh' / 'cbl-users-refresh'
//        (雲端同步完成時會派發) → 同步回來後自動重算 → authClientId 變成有效值。
//
//  另外, 這裡在「值為空」時會再嘗試一次雲端對齊 (requireCloudClientId),
//  確保即使雲端同步還沒跑完, 寫入時拿到的也是雲端真的存在的 client id。
// ============================================================================

'use client';

import * as React from 'react';
import { resolveClientId } from '@/lib/storage';
import { requireCloudClientId } from '@/lib/supabase-client-id';

/**
 * 目前登入者「建立資料時」要用的 clientId。
 *
 * @param authClientIdHint 呼叫端已知的 clientId (通常是 user.clientId);
 *                         跨機構角色會是 null/'' → 交由 resolveClientId 兜底。
 * @returns 有效的 clientId; 真的找不到時回傳 '' (呼叫端應據此回報明確錯誤)
 */
export function useAuthClientId(authClientIdHint?: string | null): string {
  const [clientId, setClientId] = React.useState<string>('');

  const recompute = React.useCallback(() => {
    if (typeof window === 'undefined') return;

    let hint: string | null = authClientIdHint ?? null;
    if (!hint) {
      try {
        const raw = localStorage.getItem('cbl_auth');
        if (raw) {
          const u = JSON.parse(raw);
          hint = u?.clientId || null;
        }
      } catch {
        hint = null;
      }
    }

    // resolveClientId 會依序嘗試: 登入帳號自己的 → 已知資料的 → 第一間學校
    const resolved = resolveClientId(hint);
    setClientId((prev) => (prev === resolved ? prev : resolved));
  }, [authClientIdHint]);

  React.useEffect(() => {
    recompute();

    // 雲端同步完成後 localStorage 的 cbl_clients 才會有值 → 重算
    const events = ['cbl-clients-refresh', 'cbl-users-refresh', 'cbl-students-refresh'];
    events.forEach((ev) => window.addEventListener(ev, recompute));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, recompute));
    };
  }, [recompute]);

  return clientId;
}

/**
 * 寫入雲端前的最後一道保險: 把 clientId 對齊到雲端真的存在的 id。
 *
 * 為什麼還需要這個 (hook 不是已經處理了嗎)?
 *   hook 處理的是「localStorage 層」的 clientId。
 *   但本機的 clientId 可能是「舊的 / 不同步的 id」(換過 project、舊 demo id),
 *   localStorage 有值不代表雲端 cbl_clients 有這筆。
 *   → 真正寫進 DB 前, 仍需對齊一次, 否則一樣撞 FK。
 *
 * @param clientId 目前要用的 clientId
 * @returns 雲端真的存在的 client id; 雲端沒學校時回傳 '' (呼叫端應回報明確錯誤)
 */
export async function alignClientIdForWrite(clientId?: string | null): Promise<string> {
  return requireCloudClientId(clientId ?? null);
}
