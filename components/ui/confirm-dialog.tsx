'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** confirm button tone — default primary, pass destructive / success via className mapping */
  tone?: 'primary' | 'success' | 'destructive';
  onConfirm: () => void;
  confirming?: boolean;
  /**
   * 額外的 className (主要用來覆寫寬度)。
   *
   * ⚠️ DialogContent 的預設寬度是 `w-[calc(100vw-2rem)] max-w-md` (最大 448px)。
   *    需要更寬的彈窗時傳 `max-w-[550px]` 這類的值 —
   *    cn() 走 twMerge, 會自動把預設的 max-w-md 換掉, 不會打架。
   */
  className?: string;
}

/**
 * 中置確認彈窗 — 取代原生 confirm()。
 * 直接用現有 ui/dialog（中置 max-w-md rounded-2xl + CSS dialog-anim-* 進出場），
 * 不新增依賴、不改全域行為。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '確定',
  cancelLabel = '取消',
  tone = 'primary',
  onConfirm,
  confirming = false,
  className,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-[calc(100vw-3rem)] rounded-2xl p-5', className)}>
        <DialogHeader>
          <DialogTitle className="text-center text-base">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-center text-sm leading-relaxed">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 pt-3 sm:justify-center">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-xl active:scale-95"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className={cn(
              'h-11 flex-1 rounded-xl active:scale-95',
              tone === 'success' && 'bg-success text-success-foreground',
              tone === 'destructive' && 'bg-destructive text-destructive-foreground'
            )}
            onClick={onConfirm}
            isLoading={confirming}
            loadingText="處理中"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
