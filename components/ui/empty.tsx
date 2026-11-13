import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Empty — shadcn/ui Base Empty 的本地實作
 * 參考: https://ui.shadcn.com/docs/components/base/empty
 *
 * 用法:
 *   <Empty>
 *     <EmptyHeader>
 *       <EmptyMedia variant="icon"><Icon /></EmptyMedia>
 *       <EmptyTitle>標題</EmptyTitle>
 *       <EmptyDescription>說明</EmptyDescription>
 *     </EmptyHeader>
 *     <EmptyContent>
 *       <Button>動作</Button>
 *     </EmptyContent>
 *   </Empty>
 *
 * 專案沒有安裝 shadcn CLI / components.json, 所以這裡手刻一份
 * 符合 shadcn 語意的最小實作, 樣式對齊本專案的 design token。
 */

const Empty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'outline' }
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    data-slot="empty"
    className={cn(
      'flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-2xl border border-dashed p-8 text-center',
      variant === 'outline'
        ? 'border-border bg-background'
        : 'border-muted-foreground/20 bg-muted/30',
      className,
    )}
    {...props}
  />
));
Empty.displayName = 'Empty';

const EmptyHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="empty-header"
    className={cn(
      'flex max-w-sm flex-col items-center gap-2 text-center',
      className,
    )}
    {...props}
  />
));
EmptyHeader.displayName = 'EmptyHeader';

const EmptyMedia = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'icon' }
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    data-slot="empty-media"
    className={cn(
      'flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
      variant === 'icon' &&
        'size-12 rounded-full bg-primary/10 text-primary [&_svg]:size-6',
      variant === 'default' && 'text-muted-foreground [&_svg]:size-8',
      className,
    )}
    {...props}
  />
));
EmptyMedia.displayName = 'EmptyMedia';

const EmptyTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="empty-title"
    className={cn('text-sm font-semibold tracking-tight', className)}
    {...props}
  />
));
EmptyTitle.displayName = 'EmptyTitle';

const EmptyDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="empty-description"
    className={cn(
      'text-xs text-muted-foreground [&>a]:underline [&>a]:underline-offset-4',
      className,
    )}
    {...props}
  />
));
EmptyDescription.displayName = 'EmptyDescription';

const EmptyContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="empty-content"
    className={cn(
      'flex w-full max-w-sm flex-col items-center gap-2 text-sm',
      className,
    )}
    {...props}
  />
));
EmptyContent.displayName = 'EmptyContent';

export {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
};
