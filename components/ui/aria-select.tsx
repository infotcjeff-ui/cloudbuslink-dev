'use client';

import * as React from 'react';
import {
  Select as AriaSelect,
  SelectValue,
  Button,
  Popover,
  ListBox,
  ListBoxItem,
  SelectProps as AriaSelectProps,
} from 'react-aria-components';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// 沿用 shadcn aria select 風格: 圓角按鈕 + Popover 列表 + 選中圈勾
//
// 重要: 必須傳 textValue 才能讓 trigger button 內 SelectValue 顯示純字串 (不含 children 內的 circle-check icon)
// API:
//   <AriaSelectRoot icon={<X />}>
//     <AriaSelectItem id="..." textValue="label 純字串">...完整 children...</AriaSelectItem>
//   </AriaSelectRoot>

interface AriaSelectRootProps<T extends object>
  extends Omit<AriaSelectProps<T>, 'children'> {
  icon?: React.ReactNode; // 觸發按鈕左側 slot
  iconClassName?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  children: React.ReactNode;
}

export function AriaSelectRoot<T extends object>({
  icon,
  iconClassName,
  triggerClassName,
  popoverClassName,
  children,
  ...props
}: AriaSelectRootProps<T>) {
  return (
    <AriaSelect {...props}>
      <Button
        className={cn(
          'flex items-center gap-1.5 rounded-full bg-white px-2.5 text-xs font-medium shadow-md ring-1 ring-black/[0.04] border-0 outline-none',
          'h-9',  // 36px, 與 status 計數 bar 42px 略矮, 視覺節奏
          'focus-visible:ring-2 focus-visible:ring-ring',
          'data-[pressed]:scale-[0.98] transition-transform',
          triggerClassName
        )}
      >
        {icon && (
          <span className={cn('shrink-0 flex items-center justify-center', iconClassName)}>
            {icon}
          </span>
        )}
        {/* SelectValue 用 children 函式, 只渲染 selectedText 純字串 — 不渲染 item.props.children (避免把 item 內的 icon / circle / tick 塞進 trigger) */}
        <SelectValue className="truncate text-left flex-1">
          {({ selectedText }) => <span className="truncate">{selectedText}</span>}
        </SelectValue>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </Button>
      <Popover
        offset={8}
        className={cn(
          'min-w-[var(--button-width)] overflow-hidden rounded-2xl border bg-white shadow-2xl p-1.5 outline-none z-50',
          'data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95',
          'data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95',
          'origin-top',
          popoverClassName
        )}
      >
        <ListBox className="outline-none">{children}</ListBox>
      </Popover>
    </AriaSelect>
  );
}

interface AriaSelectItemProps {
  id: string;
  /** 純字串標籤 — 用於 trigger button 內顯示 + 鍵盤輸入搜尋 */
  textValue: string;
  /** 完整 children — 顯示在 popover 內的 item (含圓點/雙行/圈勾) */
  children: React.ReactNode;
  className?: string;
}

export function AriaSelectItem({
  id,
  textValue,
  children,
  className,
}: AriaSelectItemProps) {
  return (
    <ListBoxItem
      id={id}
      textValue={textValue}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2 outline-none cursor-pointer',
        'data-[focused]:bg-muted/60',
        'data-[selected]:bg-blue-50/80',
        className
      )}
    >
      {children}
    </ListBoxItem>
  );
}

// 預設選中指示器: 藍色圓框 + 勾選 (iOS 風)
export function SelectedCheck({ visible }: { visible: boolean }) {
  return (
    <div
      className={cn(
        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
        visible
          ? 'border-primary bg-primary'
          : 'border-muted-foreground/30 bg-transparent'
      )}
    >
      {visible && <Check className="w-3 h-3 text-white" strokeWidth={3.5} />}
    </div>
  );
}
