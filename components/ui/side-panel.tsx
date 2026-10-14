'use client';

/**
 * SidePanel — 2026 Refined Glassmorphism panel that slides in from the right edge.
 *
 * Built on Radix Dialog (correct role="dialog" + aria-modal + focus management + ESC)
 * so we keep full a11y compliance while re-skinning the visual for a custom side menu.
 *
 *  - Side: 'right' (default) | 'left'
 *  - Width: responsive — 88vw on mobile, 320px (compact) or 360px (wide) on desktop
 *  - Surface: frosted glass (backdrop-filter + saturate), 1px white border,
 *             internal top highlight, fallback solid for browsers without blur
 *  - Motion: spring (Framer Motion), respects prefers-reduced-motion
 *  - Backdrop: dimmed + subtle blur, click-to-close, focus trap from Radix
 *  - Restores background scroll position on close
 *  - When reduced-transparency / reduced-motion is set, surfaces become solid
 */

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Side = 'right' | 'left';

interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: Side;
  /** Compact (320) | Wide (360) */
  size?: 'compact' | 'wide';
  /** Accessible title — REQUIRED */
  title: string;
  /** Optional accessible description below the title */
  description?: string;
  /** Rendered as the panel body */
  children: React.ReactNode;
  /** Optional className for the panel surface */
  panelClassName?: string;
  /** Optional className for the backdrop */
  overlayClassName?: string;
}

const SIDE_CLASSES: Record<Side, string> = {
  right: 'right-0 top-0 h-full',
  left: 'left-0 top-0 h-full',
};

export function SidePanel({
  open,
  onOpenChange,
  side = 'right',
  size = 'compact',
  title,
  description,
  children,
  panelClassName,
  overlayClassName,
}: SidePanelProps) {
  const widthClass =
    size === 'wide'
      ? 'w-[88vw] max-w-[360px] sm:w-[360px]'
      : 'w-[88vw] max-w-[320px] sm:w-[320px]';

  // Enter slide distance. Exposed as a CSS var so the `sidepanel-panel-in`
  // keyframe can use it (the exit keyframe always slides fully off-screen).
  const slideOffset = size === 'wide' ? 60 : 50;
  const slideVar = { ['--sidepanel-slide' as string]: `${slideOffset}px` };

  // NOTE: enter/exit are driven by CSS animations keyed off Radix's
  // `data-state` (see .sidepanel-* in globals.css) rather than by
  // AnimatePresence/Framer.
  //
  // Why: Framer removes its inline `opacity: 0` on the frame the exit
  // finishes. For that one frame the element reverts to its CSS opacity of 1
  // and is still visible on screen, because Radix only unmounts it afterwards.
  // Measured on the real page, that leftover frame rendered a bright sliver
  // back at the screen edge right after the slide-out — the reported
  // "sideout 後 menu 閃爍". CSS `animationend` + `both` fill mode keeps the
  // final frame and the unmount atomic, so no stale frame can be painted.
  //
  // The panel is NOT force-mounted. Radix's <Presence> must own the lifecycle:
  // it holds the node in `unmountSuspended` until `animationend` fires, which is
  // what makes the final animated frame and the unmount atomic.
  // (Passing forceMount here would leak into Overlay/Content through
  // PortalProvider context, pinning `present` to true forever and leaving the
  // closed panel stuck in the DOM.)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Overlay asChild>
          <div
            className={cn(
              'sidepanel-overlay',
              // Dim + mild backdrop blur for depth
              'fixed inset-0 z-[60] bg-black/45 supports-[backdrop-filter]:bg-black/35',
              overlayClassName
            )}
            onClick={() => onOpenChange(false)}
          />
        </DialogPrimitive.Overlay>

            {/* Panel */}
            <DialogPrimitive.Content asChild>
              <div
                role="dialog"
                aria-modal="true"
                className={cn(
                  'sidepanel-content',
                  'fixed z-[70] flex flex-col outline-none',
                  // Position
                  SIDE_CLASSES[side],
                  // Size
                  widthClass,
                  // Promote to its own GPU layer so backdrop-filter doesn't
                  // repaint against the moving transform (the real cause of
                  // 殘影: blur re-rasterized mid-transform).
                  'will-change-[transform,opacity]',
                  // Refined Glassmorphism surface
                  // - Light: translucent white with 24px blur + 16px radius
                  // - Dark: translucent black with same blur
                  // - Fallback solid color when backdrop-filter unsupported
                  'border border-white/40 dark:border-white/10',
                  'rounded-l-3xl sm:rounded-l-[28px]',
                  'shadow-[0_24px_80px_-20px_rgba(15,23,42,0.35)]',
                  'before:pointer-events-none before:absolute before:inset-0 before:rounded-l-3xl before:bg-gradient-to-b before:from-white/40 before:via-white/10 before:to-white/0 before:opacity-80 sm:before:rounded-l-[28px] dark:before:from-white/10',
                  'bg-white/70 supports-[backdrop-filter]:bg-white/55',
                  'supports-[backdrop-filter]:backdrop-blur-2xl supports-[backdrop-filter]:[-webkit-backdrop-filter:blur(24px)]',
                  'supports-[backdrop-filter]:[backdrop-filter:saturate(180%)_blur(24px)]',
                  'dark:bg-black/55 dark:supports-[backdrop-filter]:bg-black/45',
                  'motion-reduce:transition-none',
                  panelClassName
                )}
                style={slideVar}
              >
                {/* Screen-reader-only header (panel header UI is rendered by consumer) */}
                <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="sr-only">
                    {description}
                  </DialogPrimitive.Description>
                )}

                <div className="relative flex flex-col min-h-0 flex-1">
                  {children}
                </div>

                {/* Visible close affordance — top-right corner */}
                <DialogPrimitive.Close
                  aria-label="Close"
                  className={cn(
                    'absolute top-4 right-4 z-10 inline-flex h-9 w-9 items-center justify-center',
                    'rounded-full border border-white/50 bg-white/60 text-foreground/80 shadow-sm',
                    'hover:bg-white/90 hover:text-foreground active:scale-95 transition',
                    'dark:border-white/15 dark:bg-black/40 dark:hover:bg-black/60',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                  )}
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
              </div>
            </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { DialogPrimitive as SidePanelPrimitive };
