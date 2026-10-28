'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// 沿用原本 shadcn / react-aria 的 select 風格: 圓角按鈕 + Popover 列表 + 選中圈勾
//
// 底層從 react-aria-components 換到 @radix-ui/react-select。
// 對外 API (AriaSelectRoot / AriaSelectItem / SelectedCheck) 保持不變,
// 呼叫端無需改動。
//
// 注意: 必須傳 textValue 才能讓 trigger 內 Select.Value 顯示純字串
// (不含 children 內的 circle-check icon)。
// API:
//   <AriaSelectRoot icon={<X />}>
//     <AriaSelectItem value="..." textValue="label 純字串">...完整 children...</AriaSelectItem>
//   </AriaSelectRoot>

interface AriaSelectRootProps {
  /** 選中的 value — 對應 AriaSelectItem 的 value (此實作等同 id) */
  value?: string;
  /** 受控的 selectedKey 相容介面; 與 value 擇一傳入 (value 優先) */
  selectedKey?: string | number;
  onSelectionChange?: (key: string | number) => void;
  /** 未選中時 trigger 顯示的 placeholder */
  placeholder?: string;
  /** 觸發按鈕左側 slot */
  icon?: React.ReactNode;
  iconClassName?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  children: React.ReactNode;
  /** a11y */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  name?: string;
  disabled?: boolean;
}

export function AriaSelectRoot({
  value: valueProp,
  selectedKey,
  onSelectionChange,
  onValueChange,
  placeholder,
  icon,
  iconClassName,
  triggerClassName,
  popoverClassName,
  children,
  disabled,
  ...rest
}: AriaSelectRootProps & {
  // 允許直接傳 Radix 風格的 onValueChange, 內部會自動轉成 onSelectionChange
  onValueChange?: (value: string) => void;
}) {
  // value 優先; 否則從 selectedKey 取 (相容舊的 react-aria 風格)
  const value = valueProp !== undefined ? valueProp : (selectedKey != null ? String(selectedKey) : undefined);

  const handleValueChange = (v: string) => {
    // 對應 react-aria 的 onSelectionChange: 給呼叫端 string (原本就是用 (k as string) 處理)
    onSelectionChange?.(v);
    onValueChange?.(v);
  };

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={handleValueChange}
      name={rest.name}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-labelledby']}
        className={cn(
          'flex items-center gap-1.5 rounded-full bg-white px-2.5 text-xs font-medium shadow-md ring-1 ring-black/[0.04] outline-none',
          'h-9', // 36px
          'data-[placeholder]:text-muted-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring',
          'data-[state=open]:ring-2 data-[state=open]:ring-ring',
          'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
          'transition-transform',
          triggerClassName
        )}
      >
        {icon && (
          <span className={cn('shrink-0 flex items-center justify-center', iconClassName)}>
            {icon}
          </span>
        )}
        {/* Select.Value 自動根據 item.textValue 顯示純字串 — 不渲染 item 的 children,
            避免把 item 內的 icon / circle / tick 塞進 trigger。 */}
        <SelectPrimitive.Value
          placeholder={placeholder}
          className="truncate text-left flex-1"
        />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={8}
          className={cn(
            'min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border bg-white shadow-2xl p-1.5 z-50',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'origin-top',
            popoverClassName
          )}
        >
          <SelectPrimitive.Viewport className="outline-none">
            {children}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

interface AriaSelectItemProps {
  /** 等同 Radix 的 value — 內部對應到 selectedKey/onSelectionChange */
  value?: string;
  /** react-aria 時代用的 id — 此實作會 fallback 到 id */
  id?: string;
  /** 純字串標籤 — 用於 trigger 內顯示 + 鍵盤輸入搜尋 */
  textValue: string;
  /** 完整 children — 顯示在 popover 內的 item (含圓點/雙行/圈勾) */
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function AriaSelectItem({
  value: valueProp,
  id,
  textValue,
  children,
  className,
  disabled,
}: AriaSelectItemProps) {
  const value = valueProp ?? id ?? '';
  return (
    <SelectPrimitive.Item
      value={value}
      textValue={textValue}
      disabled={disabled}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2 outline-none cursor-pointer select-none',
        'data-[highlighted]:bg-muted/60 data-[highlighted]:text-foreground',
        'data-[state=checked]:bg-blue-50/80',
        'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
        className
      )}
    >
      <SelectPrimitive.ItemText className="flex items-center gap-3 flex-1 min-w-0">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
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
