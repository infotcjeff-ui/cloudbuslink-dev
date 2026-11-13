'use client';

/**
 * 一次性掃尾:清除本機殘留的測試資料 (test- 前綴)
 * 一鍵新增/清除測試資料功能已完整移除,此檔案只為舊瀏覽器殘留做一次性清理,
 * 之後可再刪除。
 */
import { STORAGE } from './storage';

const REGISTRY_KEYS = [
  'cbl_schedule_test_seed_ids',
  'cbl_schedule_test_seed_batch',
];

let done = false;

export function purgeResidualTestData(): number {
  if (typeof window === 'undefined') return 0;
  if (done) return 0;
  done = true;
  let removed = 0;
  try {
    const startsTest = (id: string) => id.startsWith('test-');
    const testBusIds = new Set<string>(
      STORAGE.buses.getAll().filter((b) => startsTest(b.id)).map((b) => b.id),
    );
    STORAGE.trips.getAll().filter((t) => startsTest(t.id)).forEach((t) => { try { STORAGE.trips.remove(t.id); removed += 1; } catch { /* ignore */ } });
    STORAGE.routes.getAll().filter((r) => startsTest(r.id)).forEach((r) => { try { STORAGE.routes.remove(r.id); removed += 1; } catch { /* ignore */ } });
    STORAGE.students.getAll().filter((s) => startsTest(s.id)).forEach((s) => { try { STORAGE.students.remove(s.id); removed += 1; } catch { /* ignore */ } });
    STORAGE.parents.getAll().filter((p) => startsTest(p.id)).forEach((p) => { try { STORAGE.parents.remove(p.id); removed += 1; } catch { /* ignore */ } });
    STORAGE.buses.getAll().filter((b) => startsTest(b.id)).forEach((b) => { try { STORAGE.buses.remove(b.id); removed += 1; } catch { /* ignore */ } });
    STORAGE.drivers.getAll().filter((d) => startsTest(d.id)).forEach((d) => { try { STORAGE.drivers.remove(d.id); removed += 1; } catch { /* ignore */ } });
    STORAGE.nannies.getAll().filter((n) => startsTest(n.id)).forEach((n) => { try { STORAGE.nannies.remove(n.id); removed += 1; } catch { /* ignore */ } });
    STORAGE.users.getAll().filter((u) => startsTest(u.id)).forEach((u) => {
      try { STORAGE.users.remove(u.id); STORAGE.userFeaturePermissions.remove(u.id); removed += 1; } catch { /* ignore */ }
    });
    if (testBusIds.size > 0) {
      STORAGE.nannies.getAll().forEach((n) => {
        if (Array.isArray(n.assignedBusIds) && n.assignedBusIds.some((bid) => testBusIds.has(bid))) {
          try { STORAGE.nannies.update(n.id, { assignedBusIds: n.assignedBusIds.filter((bid) => !testBusIds.has(bid)) }); } catch { /* ignore */ }
        }
      });
    }
    REGISTRY_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    if (removed > 0) {
      ['cbl-trips-refresh', 'cbl-buses-refresh', 'cbl-drivers-refresh', 'cbl-nannies-refresh', 'cbl-nannys-refresh', 'cbl-students-refresh', 'cbl-routes-refresh', 'cbl-users-refresh'].forEach((e) => {
        try { window.dispatchEvent(new CustomEvent(e)); } catch { /* ignore */ }
      });
    }
  } catch { /* ignore */ }
  return removed;
}
