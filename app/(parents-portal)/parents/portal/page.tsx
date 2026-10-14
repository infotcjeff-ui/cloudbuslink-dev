'use client';

import ParentsPortalContent from '@/components/portal/ParentsPortalContent';

/**
 * /parents/portal — (main) layout 對 parent 角色的 redirect 目標。
 * 放在 (parents-portal) group 下, 沿用同一套家長 portal 版面
 * (角色保護 + 家長專區 header + 底部導覽)。
 */
export default function ParentsPortalPage() {
  return <ParentsPortalContent />;
}