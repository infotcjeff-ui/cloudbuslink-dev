'use client';

import { useId } from 'react';

import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type Quality = 'sd' | 'hd';

/* shadcn-studio switch-09: 雙標籤可點擊開關 (Yes/No -> 標清/高清) */
export function QualitySwitch({
  value,
  onChange,
  className,
}: {
  value: Quality;
  onChange: (q: Quality) => void;
  className?: string;
}) {
  const id = useId();
  const checked = value === 'hd';
  const toggleSwitch = () => onChange(checked ? 'sd' : 'hd');

  return (
    <div
      className={cn('group inline-flex items-center gap-2', className)}
      data-state={checked ? 'checked' : 'unchecked'}
    >
      <span
        id={`${id}-sd`}
        aria-controls={id}
        onClick={() => onChange('sd')}
        className="cursor-pointer text-right text-[11px] font-medium text-foreground group-data-[state=checked]:text-muted-foreground/70"
      >
        標清
      </span>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={toggleSwitch}
        aria-labelledby={`${id}-sd ${id}-hd`}
      />
      <span
        id={`${id}-hd`}
        aria-controls={id}
        onClick={() => onChange('hd')}
        className="cursor-pointer text-left text-[11px] font-medium text-foreground group-data-[state=unchecked]:text-muted-foreground/70"
      >
        高清
      </span>
    </div>
  );
}

export default QualitySwitch;
