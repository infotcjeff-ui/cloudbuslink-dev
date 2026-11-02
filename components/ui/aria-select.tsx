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
// ⚠️ Radix 的兩個「陷阱」—— 本檔案所有排版都必須繞開它們:
//
//   1) <Select.Value> 與 <Select.ItemText> 都會把傳入的 className / style
//      直接丟掉 (radix-ui/react-select 的實作是
//      `const { className, style, ...rest } = props`, 之後再也沒用到這兩個值)。
//      → 想控制排版, 只能在他們「外面」自己包一層 <span>。
//
//   2) <Select.Value> 若沒給 children, Radix 會把「被選中 item 的
//      ItemText children」整份 portal 進 trigger。
//      我們的 item children 含有 圓點 / 頭像 / 選中圈勾, 被 portal 進 trigger
//      之後會發生:
//        - trigger 多出一個圈勾 icon
//        - trigger 內容被擠成上下兩行 (icon + 文字 / 圈勾)
//      → 這裡自己維護「value → 純文字」對照表, 直接把純文字當作
//        <Select.Value> 的 children 傳入; 有 children 時 Radix 不會再 portal。
//
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

/**
 * 收集所有 item 的「value → 純文字標籤」對照表。
 *
 * 用途: trigger 顯示用。
 *   Radix 在沒有 children 時會把 item 的完整 children (圓點/頭像/圈勾)
 *   portal 進 trigger, 導致 trigger 內容變兩行 + 出現多餘的圈勾。
 *   改成自己查出純文字傳給 <Select.Value>, 即可讓 trigger 永遠只有一行純字。
 *
 * 遞迴處理 Fragment / group, 讓包在 <></> 裡面的 item 也能被收集到。
 */
function collectItemLabels(children: React.ReactNode): Map<string, string> {
  const map = new Map<string, string>();

  const visit = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return;

      const props = child.props as AriaSelectItemProps & { children?: React.ReactNode };
      if (typeof props.textValue === 'string') {
        const key = props.value ?? props.id ?? '';
        map.set(String(key), props.textValue);
      }

      if (child.type === React.Fragment && props.children) {
        visit(props.children);
      }
    });
  };

  visit(children);
  return map;
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

  // value → 純文字對照表 (給 trigger 用)
  const labels = React.useMemo(() => collectItemLabels(children), [children]);
  const currentLabel = value !== undefined ? labels.get(String(value)) : undefined;

  // Radix 的 placeholder 條件是 value === '' 或 undefined。
  // 這個時候觸發器只顯示 placeholder, 不顯示 item 的純文字。
  // 所以當呼叫端沒給 placeholder、但有「空值 item」(id / value = '') 時,
  // 直接拿那個 item 的 textValue 當 placeholder —— 避免觸發器變成空白。
  const emptyItemLabel = labels.get('');
  const resolvedPlaceholder = placeholder ?? (value === '' ? emptyItemLabel : undefined);

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
        {/* Radix 會丟掉 <Select.Value> 的 className, 所以排版只能靠外層這一層:
            - flex-1 + min-w-0: 佔滿剩餘空間, 讓 chevron 靠右
            - truncate: nowrap + ellipsis, 保證「任何螢幕寬度都只有一行」
            有傳 children 給 <Select.Value> 時 Radix 不會把 item 的完整 children
            (圓點/頭像/圈勾) portal 進 trigger → 不會再出現圈勾或多餘的一行。 */}
        <span className="min-w-0 flex-1 truncate text-left">
          <SelectPrimitive.Value placeholder={resolvedPlaceholder}>
            {currentLabel ?? ''}
          </SelectPrimitive.Value>
        </span>
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
        'flex items-center gap-2 rounded-xl px-3 py-2 outline-none cursor-pointer select-none',
        'data-[highlighted]:bg-muted/60 data-[highlighted]:text-foreground',
        'data-[state=checked]:bg-blue-50/80',
        'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
        className
      )}
    >
      {/* Radix 會丟掉 <Select.ItemText> 的 className, 所以用內層 span 建立
          flex row:
            - 圓點 (w-2.5 h-2.5) 變成 flex item → 才有尺寸 (inline span 會變 0 寬)
            - 文字 (flex-1 truncate) 佔滿剩餘空間並在必要時截斷
            - 圈勾留在同一行右側, 不會被擠到第二行
          (原本 ItemText 沒有 display:flex, 內容是 inline 排版, 圈勾是 block 級
           div → 必定換行, item 變成兩行高) */}
      <SelectPrimitive.ItemText>
        <span className="flex items-center gap-2 min-w-0">{children}</span>
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
