'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Siren,
  CheckCircle2,
  Wrench,
  Route as RouteIcon,
  HeartPulse,
  TriangleAlert,
} from 'lucide-react';
import { STORAGE } from '@/lib/storage';
import type { IncidentKind, IncidentReport, Trip } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  類型 — 香港校巴最常遇到的突發狀況                                     */
/* -------------------------------------------------------------------------- */

interface IncidentType {
  id: string;
  label: string;
  example: string;
  icon: React.ReactNode;
}

const INCIDENT_TYPES: IncidentType[] = [
  { id: 'breakdown', label: '校巴故障', example: '如：壞車 / 冷氣故障', icon: <Wrench width={18} height={18} /> },
  { id: 'accident', label: '交通意外', example: '如：路面事故需改道', icon: <Siren width={18} height={18} /> },
  { id: 'road_closed', label: '封路 / 改道', example: '如：臨時封路繞行', icon: <RouteIcon width={18} height={18} /> },
  { id: 'sick', label: '學生不適', example: '如：嘔吐 / 受傷', icon: <HeartPulse width={18} height={18} /> },
  { id: 'other', label: '其他突發', example: '致電時再說明', icon: <TriangleAlert width={18} height={18} /> },
];

export const INCIDENT_KIND_LABELS: Record<string, string> = {
  ...Object.fromEntries(INCIDENT_TYPES.map((t) => [t.id, t.label])),
  // 舊資料相容: 已移除的選項仍要顯示中文標籤
  traffic: '塞車中',
  no_show: '學生未上車',
  weather: '惡劣天氣',
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  IncidentReportModal — 置中 popup                                           */
/* -------------------------------------------------------------------------- */

export interface IncidentReportModalProps {
  open: boolean;
  onClose: () => void;
  /** 回報人姓名 (保姆名) — 用來組成 WhatsApp 預設文字 */
  reporterName: string;
  /** 回報人電話 (快照留底用) */
  reporterPhone?: string;
  /** 保姆 id (cbl_nannies.id, 盡量填; 找不到就空字串) */
  nannyId?: string;
  /** 所屬學校 clientId (跨機構帳號可空字串) */
  clientId?: string;
  /** 當天班次 (供「相關班次」選擇, 不傳就係都顯示「未選擇班次」) */
  trips?: Trip[];
}

function tripTypeLabel(t: Trip): string {
  if (t.type === 'custom' && t.customTypeLabel) return t.customTypeLabel;
  if (t.type === 'morning') return '上午班';
  if (t.type === 'afternoon') return '下午班';
  return '自訂班次';
}

function tripOptionLabel(t: Trip): string {
  const bus = STORAGE.buses.getAll().find((b) => b.id === t.busId);
  const plate = bus?.plateNumber || '';
  const time = t.plannedStartTime || '';
  return `${time} ${tripTypeLabel(t)}${plate ? ` · ${plate}` : ''}`.trim();
}

export default function IncidentReportModal({ open, onClose, reporterName, reporterPhone = '', nannyId = '', clientId = '', trips = [] }: IncidentReportModalProps) {
  const [incidentId, setIncidentId] = React.useState<string>('');
  const [tripId, setTripId] = React.useState<string>('');
  const [waypointId, setWaypointId] = React.useState<string>('');
  const [sent, setSent] = React.useState(false);

  // 廣播制: 發送給所有 system_admin + super_admin, 不再選單一管理員
  React.useEffect(() => {
    if (!open) return;
    setSent(false);
    setIncidentId('');
    setTripId('');
    setWaypointId('');
  }, [open ]);

  const incident = INCIDENT_TYPES.find((t) => t.id === incidentId) ?? null;
  const selectedTrip = trips.find((t) => t.id === tripId) ?? null;
  const selectedWaypoints = selectedTrip?.waypoints ?? [];

  // 確定送出 → 廣播給所有 system_admin + super_admin (localStorage + Supabase) → 成功畫面 → fade out 自動關閉
  const handleConfirm = () => {
    if (incident) {
      try {
        const now = new Date().toISOString();
        const trip = trips.find((t) => t.id === tripId) ?? null;
        const wp = trip?.waypoints.find((w) => w.id === waypointId) ?? null;
        const baseLabel = trip ? tripOptionLabel(trip) : '';
        const wpLabel = wp ? ` · ${wp.location.name}` : '';
        const row: IncidentReport = {
          id: STORAGE.genId('incident'),
          clientId: (clientId || '').trim(),
          nannyId,
          reporterName: reporterName || '',
          reporterPhone: reporterPhone || '',
          adminId: '',
          adminName: '',
          adminPhone: '',
          kind: incidentId as IncidentKind,
          kindLabel: incident.label,
          tripId: trip?.id ?? '',
          tripLabel: trip ? `${baseLabel}${wpLabel}` : '',
          tripDate: trip?.date ?? '',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        };
        STORAGE.incidents.add(row);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cbl-incidents-refresh'));
        }
        // 背景推上雲端 (失敗唔阻斷, 下次 sync 會再合併)
        void import('@/lib/supabase-incidents').then(({ supabaseIncidents }) =>
          supabaseIncidents.add(row).catch(() => undefined),
        );
      } catch {
        /* 留底失敗唔阻斷回報流程 */
      }
    }
    setSent(true);
    window.setTimeout(() => {
      onClose();
      // 重置, 等下次開啟時 useEffect 會再初始化
      window.setTimeout(() => setSent(false), 300);
    }, 1800);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="incident-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            key={sent ? 'incident-success' : 'incident-form'}
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden dark:bg-slate-900"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="incident-title"
          >
            {sent ? (
              /* ---------- 成功送出 ---------- */
              <div className="px-6 py-10 flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                >
                  <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                </motion.div>
                <p className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">成功送出</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {incident?.label ?? '異常'} · 已通知全體管理員
                </p>
              </div>
            ) : (
              /* ---------- 回報表單 ---------- */
              <>
                <div className="px-5 pt-5 pb-3 flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500 text-white shrink-0">
                    <Siren width={20} height={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 id="incident-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                      異常回報
                    </h2>
                  </div>
                  <button
                    type="button"
                    aria-label="關閉"
                    onClick={onClose}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-95 transition-transform"
                  >
                    <X width={16} height={16} />
                  </button>
                </div>

                <div className="px-5 pb-5 space-y-4 max-h-[60vh] overflow-y-auto">
                  {/* 類型 */}
                  <div>
                    <label htmlFor="incident-kind" className="block text-xs font-semibold text-muted-foreground mb-1.5 px-0.5">類型</label>
                    <select
                      id="incident-kind"
                      value={incidentId}
                      onChange={(e) => setIncidentId(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    >
                      <option value="">請選擇類型</option>
                      {INCIDENT_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label} ({t.example})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 相關班次 (當天) — 揀咗類型先出現 */}
                  {incident && (
                    <>
                    <div>
                      <label htmlFor="incident-trip" className="block text-xs font-semibold text-muted-foreground mb-1.5 px-0.5">相關班次 (當天)</label>
                      {trips.length === 0 ? (
                        <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2.5">
                          今日暫無班次, 將以「未選擇班次」送出
                        </p>
                      ) : (
                        <select
                          id="incident-trip"
                          value={tripId}
                          onChange={(e) => { setTripId(e.target.value); setWaypointId(''); }}
                          className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                        >
                          <option value="">未選擇班次</option>
                          {trips.map((t) => (
                            <option key={t.id} value={t.id}>
                              {tripOptionLabel(t)}{t.date ? ` · ${t.date}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* 站點 — 揀咗班次先出現 */}
                    {selectedTrip && (
                      <div>
                        <label htmlFor="incident-waypoint" className="block text-xs font-semibold text-muted-foreground mb-1.5 px-0.5">站點</label>
                        {selectedWaypoints.length === 0 ? (
                          <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2.5">
                            此班次暫無站點, 將以「未選擇站點」送出
                          </p>
                        ) : (
                          <select
                            id="incident-waypoint"
                            value={waypointId}
                            onChange={(e) => setWaypointId(e.target.value)}
                            className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                          >
                            <option value="">未選擇站點</option>
                            {selectedWaypoints.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.location.name}{w.scheduledTime ? ` · ${w.scheduledTime}` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                    </>
                  )}

                  {/* 確定送出 */}
                  <p className="text-xs text-muted-foreground text-center -mb-1">*送出後會即時通知所有管理員</p>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!incident}
                    className="w-full h-12 rounded-xl bg-rose-500 text-white text-base font-bold active:scale-[0.98] transition-transform disabled:opacity-40"
                  >
                    確定送出
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
