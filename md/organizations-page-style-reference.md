# OneFleet — Organizations Page UI/UX Style Reference

> **Purpose**: A self-contained style spec extracted from `http://localhost:3000/onefleet-system-admin/organizations`, intended to be reused as the design baseline when building a new project that should look and feel like the OneFleet operator console.
>
> **Captured**: 14 October 2026 (UTC+8)
> **Source files** (read in full):
> - `app/onefleet-system-admin/(dashboard)/organizations/page.tsx`
> - `app/onefleet-system-admin/(dashboard)/organizations/OrganizationsContent.tsx`
> - `app/onefleet-system-admin/(dashboard)/organizations/AddOrganizationModal.tsx`
>
> **Companion rules referenced**:
> - `.cursor/rules/design-law.mdc` — design tokens (canonical)
> - `.cursor/rules/no-heroui-mandate.mdc` — no HeroUI in new code
> - `.cursor/rules/system-admin-date-format.mdc` — `YYYY/MM/DD` for admin surfaces
> - `.cursor/rules/i18n-law.mdc` + `i18n-enforcement.mdc` — translation keys
> - `.cursor/rules/custom-dropdown-overflow-law.mdc` — portaled dropdowns

---

## Table of Contents

1. [Design Philosophy at a Glance](#1-design-philosophy-at-a-glance)
2. [Page Anatomy](#2-page-anatomy)
3. [Color Tokens (Light + Dark)](#3-color-tokens-light--dark)
4. [Typography Scale](#4-typography-scale)
5. [Spacing, Radius, Shadow](#5-spacing-radius-shadow)
6. [Animation Tokens](#6-animation-tokens)
7. [Core Reusable Primitives](#7-core-reusable-primitives)
8. [Header Row Pattern (Title + Stat Tiles)](#8-header-row-pattern-title--stat-tiles)
9. [Action Toolbar Pattern](#9-action-toolbar-pattern)
10. [Tab Strip Pattern (Segmented Control with Sliding Pill)](#10-tab-strip-pattern-segmented-control-with-sliding-pill)
11. [Table Card Pattern (SectionHeader + Filter Bar + Table + Footer)](#11-table-card-pattern-sectionheader--filter-bar--table--footer)
12. [Per-Row Layout (Avatar, Truncate, Pill Stack, Action Cluster)](#12-per-row-layout-avatar-truncate-pill-stack-action-cluster)
13. [Empty / Loading / Error States](#13-empty-loading--error-states)
14. [Modal Chrome (Hand-Coded, Not HeroUI)](#14-modal-chrome-hand-coded-not-heroui)
15. [3-Column Form Layout (Add Organization)](#15-3-column-form-layout-add-organization)
16. [Form Field Primitives (LabeledInput, UserField, Select)](#16-form-field-primitives-labeledinput-userfield-select)
17. [Role / Toggle Cards (Multi-Select Pill-Buttons)](#17-role--toggle-cards-multi-select-pill-buttons)
18. [Mirror Preview Block (Read-Only Summary)](#18-mirror-preview-block-read-only-summary)
19. [MG Search Result Row + Selected Card](#19-mg-search-result-row--selected-card)
20. [Custom Portaled Dropdown Pattern](#20-custom-portaled-dropdown-pattern)
21. [Modal Footer (Cancel + Primary)](#21-modal-footer-cancel--primary)
22. [Iconography — Solar Icon Set (AsyncIcon)](#22-iconography--solar-icon-set-asynicon)
23. [Focus Ring Convention (Universal)](#23-focus-ring-convention-universal)
24. [Dark Mode Cheat Sheet](#24-dark-mode-cheat-sheet)
25. [i18n / Translation Key Naming](#25-i18n--translation-key-naming)
26. [Copy-Ready Tailwind Cheat Sheet](#26-copy-ready-tailwind-cheat-sheet)
27. [File Map — Where Each Pattern Lives](#27-file-map--where-each-pattern-lives)
28. [Build-Your-Own-Page Checklist](#28-build-your-own-page-checklist)

---

## 1. Design Philosophy at a Glance

The organizations page is built on three non-negotiable principles that should carry into any new project:

| # | Principle | What it means in practice |
|---|---|---|
| 1 | **Hand-coded Tailwind only** | No `@heroui/react` imports. Every button, card, modal, table, dropdown, pill is built with raw Tailwind classes that match the canonical "backup" page reference. |
| 2 | **One consistent visual rhythm** | All pages share the same color palette, type scale, animation curve, border radius, and shadow. When in doubt, copy what the backup page does. |
| 3 | **Operator-first, dark-mode ready** | Tight typography (`12px` body, `10px` uppercase labels), slate chrome, blue primary action, dense but breathable spacing. Every visible surface must have a `dark:` variant. |

**The canonical reference page** for any new surface is `app/onefleet-system-admin/(dashboard)/backup/page.tsx`. The organizations page was deliberately rebuilt to match it (see `OrganizationsContent.tsx` line 12 comment: "match the design language used in backup/page.tsx so the two pages feel like part of the same operator console.").

---

## 2. Page Anatomy

Every list page in OneFleet follows this 5-layer vertical stack. All classes are taken verbatim from the organizations page.

```
<div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">       ← Page container
  <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2">  ← L1. Header row
  <div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">  ← L2. Action toolbar
  <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">  ← L3. Table card
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">  ← L3a. SectionHeader
    <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">   ← L3b. Filter bar (tabs + search)
    <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto">  ← L3c. Table scroll region
    <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-slate-100 bg-slate-50/40">  ← L3d. Pagination footer
  <Modals />                                                            ← L4. Modals
</div>
```

| Layer | Purpose | Key class tokens |
|---|---|---|
| L1 | Title + subtitle + stat tiles | `text-[17px] font-bold`, `text-[12px] text-slate-500` |
| L2 | Toolbar with grouped actions (left), primary CTA (right) | `flex items-center gap-2 flex-wrap` |
| L3 | Card with header, filter, table, footer | `rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]` |
| L4 | Modals stacked at root | `<AnimatePresence>` for mount/unmount |

---

## 3. Color Tokens (Light + Dark)

All colors come from the OneFleet palette. Never use custom hex literals.

| Role family | Light tokens | Dark counterparts | Where it's used |
|---|---|---|---|
| Chrome (neutral UI) | `slate-50, slate-100, slate-200, slate-500, slate-700, slate-900` | `slate-800, slate-900, slate-200, slate-400, slate-200, slate-100` | Borders, dividers, body text, muted labels, neutral pills |
| Primary action | `blue-50, blue-100, blue-200/70, blue-600, blue-700` | `blue-950/40, blue-950/50, blue-800/50, blue-400, blue-300` | Primary buttons, active tab pill, primary icon tiles |
| Secondary feature | `violet-50, violet-100, violet-200/70, violet-600, violet-700` | `violet-950/40, violet-950/60, violet-800/50, violet-400, violet-300` | Partners & Vendors tab, vendor-type accent, MG icon tile |
| Success | `emerald-50, emerald-100, emerald-200/70, emerald-500, emerald-700` | `emerald-950/30, emerald-950/50, emerald-800/50, emerald-500, emerald-300` | "Synced" pill, "Add First User" icon, restore action |
| Warning | `amber-50, amber-100, amber-200/70, amber-500, amber-600, amber-700, amber-800` | `amber-950/30, amber-950/50, amber-800/50, amber-500, amber-400, amber-300` | Orphaned-tenant count, backfill actions, inline blocker |
| Danger | `rose-50, rose-100, rose-200/70, rose-500, rose-600, rose-700` | `rose-950/40, rose-800/50, rose-400, rose-500, rose-300` | "Drift" pill, "Fix" button, deactivate action, required `*` |
| Info | `sky-50, sky-100, sky-200/70, sky-500, sky-700` | `sky-950/40, sky-800/50, sky-400, sky-300` | (reserved — same family as primary action) |

**Pattern for translucent icon tiles** (the colored rounded squares that head each section):
```
bg-{tone}-50 text-{tone}-600 ring-1 ring-inset ring-{tone}-100
dark:bg-{tone}-950/40 dark:text-{tone}-300 dark:ring-{tone}-800/50
```
(Replace `{tone}` with one of: `blue`, `violet`, `emerald`, `amber`, `rose`, `slate`.)

**Pattern for full-color icon tiles** (the page-header logo block):
```
bg-{tone}-600 text-white             ← used on page header
```

**Pattern for selected-card backgrounds** (form selection cards):
```
bg-{tone}-50 ring-{tone}-200/70       ← selected
bg-white ring-slate-200               ← unselected
dark:bg-{tone}-950/40 dark:ring-{tone}-800/50
dark:bg-slate-800 dark:ring-slate-700
```

---

## 4. Typography Scale

Tight. Smaller than Material defaults. The "12px body / 10px label" rhythm is the page's signature.

| Role | Class | Example |
|---|---|---|
| Page title (H1) | `text-[17px] font-bold text-slate-900 leading-tight` | "Organizations" |
| Page subtitle | `text-[12px] text-slate-500 mt-0.5` | "Manage platform tenants, vendors, and subscribers." |
| Section title (H3 inside card) | `text-[14px] font-semibold text-slate-900 leading-tight` | "Subscribers" |
| Section subtitle | `text-[11px] text-slate-500 mt-0.5 leading-tight` | "30 records · subscribers" |
| Modal title (H2) | `text-[14px] font-semibold text-slate-900 dark:text-slate-100` | "Add Organization" |
| Modal subtitle | `text-[11px] text-slate-500 truncate dark:text-slate-400` | "Create a new organization and assign its roles." |
| Sub-card title | `text-[12.5px] font-semibold text-slate-900` | "Management Group" |
| Sub-card hint | `text-[11px] text-slate-500 leading-snug` | sub-line under sub-card title |
| Body / table cell | `text-[12px] font-medium text-slate-700` | "USL Holdings Company Limited" |
| Strong body | `text-[12px] font-semibold text-slate-900` | Selected role label |
| Small / helper text | `text-[11px] text-slate-500` | "Used for sign-in; no spaces allowed" |
| Inline blocker (amber) | `text-[11px] text-amber-800 dark:text-amber-300 leading-snug` | "Password is too short" |
| Label uppercase | `text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500` | "ORGANIZATION" column header, "IDENTITY" form section |
| Section badge (small caps) | `text-[9.5px] uppercase tracking-[0.08em] font-semibold text-slate-400` | "MIRROR TO MANAGEMENT GROUP" sub-card label |
| Code / monospace | `font-mono text-[10px]–text-[12px] text-slate-700` | `OF-O-C3U8`, `org_3K0QkFdjXuaO8jogdtZFUsrFnwy` |
| Stat tile value | `text-lg font-semibold tabular-nums leading-none text-{tone}-700` | `30`, `93%` |

**Weight ladder** — when in doubt:

| Weight | Tailwind | When to use |
|---|---|---|
| 500 (medium) | `font-medium` | **The default** — body copy, table cells, input value text, placeholders |
| 600 (semibold) | `font-semibold` | Section titles, headers, button text, label uppercase, strong emphasis |
| 700 (bold) | `font-bold` | **Rare.** Page title (H1) and headline numbers in stat tiles only |

**Never pair `text-slate-700` without a weight** — typed values on inputs read as weak at 400.

**`tabular-nums`** is used everywhere a number might change (page indicators, counts, currency) so digits don't shift width when values update.

---

## 5. Spacing, Radius, Shadow

### Spacing rhythm

| Pattern | Class |
|---|---|
| Page container | `flex flex-col gap-4 p-6 pb-6 h-full min-h-0` |
| Section header (inside card) | `px-5 pt-5 pb-3` |
| Filter bar | `px-5 pb-3 pt-1 flex-wrap` |
| Table footer (pagination) | `px-5 py-2.5` |
| Table cell | `px-5 py-2.5` (first/last column), `px-3 py-2.5` (middle columns) |
| Modal header | `px-5 py-4` |
| Modal body | `px-5 py-5` (3-column grid container) |
| Modal footer | `px-5 py-3` |
| Card body padding | `px-4 py-3` (sub-card) or `px-4 py-4` (sub-card body) |
| Section vertical stack | `space-y-3` (form-like), `space-y-2` (denser form), `space-y-1.5` (compact lists) |
| Inline gap between buttons | `gap-1`, `gap-1.5` |
| Row cluster | `gap-2`, `gap-3` |
| Section gap | `gap-4` |

### Border radius

| Element | Class | Note |
|---|---|---|
| Buttons / Inputs / Pills | `rounded-md` (6px) | Default for every interactive control |
| Cards (page chrome) | `rounded-xl` (12px) | Top-level table card, modal shell |
| Sub-cards inside modals | `rounded-lg` (8px) | Column cards, form sections |
| KPI / Stat tiles | `rounded-lg` | |
| Active filter pill (inside segmented control) | `rounded-[5px]` | Slightly tighter than parent button to feel "nested" |
| Avatars / icon-tile backgrounds / dot indicators | `rounded-full` or `rounded-md` | `rounded-md` for 32×32 to 40×40 icon tiles, `rounded-full` for 16×16 dots |
| Modal/dropdown | `rounded-lg` or `rounded-xl` | `rounded-lg` for the vendor-type dropdown panel, `rounded-xl` for the modal shell |

### Shadows

| Element | Class | Note |
|---|---|---|
| Cards (page chrome) | `shadow-[0_1px_2px_rgba(15,23,42,0.04)]` | Hairline shadow, no offset |
| Active filter pill | `shadow-[0_1px_2px_rgba(37,99,235,0.35)]` | Tinted with primary color |
| Modal | `shadow-xl` | Lifts off the backdrop |
| Portaled dropdown | `shadow-xl` | |
| Buttons | `shadow-sm` | Subtle presence |
| Icon tiles | None (they sit inside `ring-1 ring-inset` instead) | |

### Backdrop

Modal: `bg-slate-900/40 backdrop-blur-sm` (pinned behind the modal at `z-50`).

---

## 6. Animation Tokens

The page is animated with `framer-motion` using a small, fixed set of tokens. **All tokens are imported from `@/lib/design-system/cheatsheet` (`animation` and `EASE`).** The values below are the canonical constants — never inline new numbers.

```ts
// The universal snappy ease-out — the OneFleet "snap".
export const EASE = [0.25, 0.1, 0.25, 1] as const;
export const ANIMATION_EASE = EASE;  // alias used in OrganizationsContent

// Page-level fade
export const PAGE_FADE_DURATION = 0.2;

// Tab/filter content swap
export const TAB_FADE_DURATION = 0.22;
export const TAB_SLIDE_DISTANCE = 6;

// Modal entrance/exit (intentionally tight — operator clicks through a known flow)
export const MODAL_FADE = 0.14;
export const MODAL_SLIDE = 6;

// Filter pill spring (the active blue pill sliding between buttons)
export const PILL_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.6,
} as const;

// Row stagger (delay per row in a list)
export const ROW_STAGGER_BASE = 0.025;
export const ROW_STAGGER_CAP = 0.2;
```

**Usage example** (from `OrganizationsContent.tsx`):
```tsx
<motion.div
  key="rows"
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: PAGE_FADE_DURATION, ease: ANIMATION_EASE }}
>
```

**Row-level stagger** (used on `motion.tr`):
```tsx
transition={{
  duration: 0.22,
  ease: ANIMATION_EASE,
  delay: Math.min(rowIndex * ROW_STAGGER_BASE, ROW_STAGGER_CAP),
}}
```

**For elements that affect layout** (grid cells, table rows, list items): **only animate `opacity`** — position transforms cause layout shifts.

**For non-layout elements** (modal overlays, popovers, dropdowns): directional motion (`y: 6` slide) is safe.

---

## 7. Core Reusable Primitives

Every page on the system admin surface re-uses these small components. They are inlined at the top of `OrganizationsContent.tsx` (and the other pages) but their shape is the canonical pattern. **Re-implement them in your new project exactly as shown** — copy the file, do not "improve" them.

### 7.1 `Pill` — Status badge

```tsx
function Pill({
  children, tone = "neutral", size = "md", className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "primary" | "success" | "danger" | "warning" | "violet" | "info";
  size?: "sm" | "md";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-600 ring-slate-200",
    primary: "bg-blue-50 text-blue-700 ring-blue-200/70",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
    danger:  "bg-rose-50 text-rose-700 ring-rose-200/70",
    warning: "bg-amber-50 text-amber-800 ring-amber-200/70",
    violet:  "bg-violet-50 text-violet-700 ring-violet-200/70",
    info:    "bg-sky-50 text-sky-700 ring-sky-200/70",
  };
  const sizes = size === "sm"
    ? "px-1.5 py-0.5 text-[10px]"
    : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md ring-1 ring-inset font-medium tracking-wide uppercase ${tones[tone]} ${sizes} ${className}`}>
      {children}
    </span>
  );
}
```

### 7.2 `Dot` — Tiny status indicator

```tsx
function Dot({ tone = "neutral" }: {
  tone?: "neutral" | "success" | "danger" | "warning" | "primary" | "violet";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-400", success: "bg-emerald-500", danger: "bg-rose-500",
    warning: "bg-amber-500", primary: "bg-blue-500", violet: "bg-violet-500",
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${tones[tone]}`} />;
}
```

### 7.3 `Button` — Universal button (7 variants)

```tsx
function Button({
  children, onClick, variant = "primary", size = "md", isLoading = false,
  disabled = false, startIcon, endIcon, title, className = "", type = "button",
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle" | "warning" | "success";
  size?: "sm" | "md";
  isLoading?: boolean;
  disabled?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  title?: string;
  className?: string;
  type?: "button" | "submit" | "reset";
}) {
  const variants: Record<string, string> = {
    primary:   "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-sm",
    secondary: "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm",
    ghost:     "bg-transparent hover:bg-slate-100 text-slate-700 border-transparent",
    danger:    "bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-sm",
    subtle:    "bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent",
    warning:   "bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm",
    success:   "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-sm",
  };
  const sizes = size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-[13px]";
  return (
    <button
      type={type} title={title} onClick={onClick}
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border font-medium cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes} ${className}`}
    >
      {isLoading && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {!isLoading && startIcon}
      <span className="truncate">{children}</span>
      {!isLoading && endIcon}
    </button>
  );
}
```

### 7.4 `IconButton` — Square icon trigger (6 variants)

```tsx
function IconButton({
  onClick, children, title, variant = "ghost", className = "",
}: {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  title?: string;
  variant?: "ghost" | "danger" | "subtle" | "primary" | "warning" | "success";
  className?: string;
}) {
  const variants: Record<string, string> = {
    ghost:   "hover:bg-slate-100 text-slate-500 hover:text-slate-700",
    danger:  "hover:bg-rose-50 text-slate-400 hover:text-rose-600",
    subtle:  "bg-slate-100 hover:bg-slate-200 text-slate-600",
    primary: "hover:bg-blue-50 text-slate-400 hover:text-blue-600",
    warning: "hover:bg-amber-50 text-slate-400 hover:text-amber-600",
    success: "hover:bg-emerald-50 text-slate-400 hover:text-emerald-600",
  };
  return (
    <button
      type="button" title={title} aria-label={title}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(e); }}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
```

### 7.5 `Card` — Page-chrome card

```tsx
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden ${className}`}>
      {children}
    </div>
  );
}
```

### 7.6 `SectionHeader` — Card title bar

Layout: `[icon-in-tinted-box] [title + optional subtitle] ... [actions]`. The icon background uses one of six accents.

```tsx
function SectionHeader({
  icon, title, subtitle, actions, accent = "primary",
}: {
  icon: string; title: string; subtitle?: string; actions?: React.ReactNode;
  accent?: "primary" | "violet" | "warning" | "success" | "danger" | "neutral";
}) {
  const accentBg: Record<string, string> = {
    primary: "bg-blue-50 text-blue-600 ring-blue-100",
    violet:  "bg-violet-50 text-violet-600 ring-violet-100",
    warning: "bg-amber-50 text-amber-600 ring-amber-100",
    success: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    danger:  "bg-rose-50 text-rose-600 ring-rose-100",
    neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset shrink-0 ${accentBg[accent]}`}>
          <Icon icon={icon} width={18} height={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-slate-900 leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
    </div>
  );
}
```

### 7.7 `StatTile` — Compact KPI

```tsx
function StatTile({
  label, value, hint, tone = "neutral", icon,
}: {
  label: string; value: string | number; hint?: string;
  tone?: "neutral" | "primary" | "violet" | "success" | "danger" | "warning";
  icon?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "text-slate-700", primary: "text-blue-700", violet: "text-violet-700",
    success: "text-emerald-700", danger: "text-rose-700", warning: "text-amber-700",
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-500">{label}</span>
        {icon && <Icon icon={icon} width={12} height={12} className="text-slate-400" />}
      </div>
      <span className={`text-lg font-semibold tabular-nums leading-none ${tones[tone]}`}>{value}</span>
      {hint && <span className="text-[10px] text-slate-500 leading-tight">{hint}</span>}
    </div>
  );
}
```

### 7.8 `FilterTabGroup` — Segmented control with sliding pill

The page's defining interaction widget. A `motion.span` with `layoutId` slides between buttons on click.

```tsx
function FilterTabGroup<T extends string>({
  value, onChange, options, layoutId,
}: {
  value: T; onChange: (next: T) => void;
  options: { value: T; label: string; icon?: string }[];
  layoutId: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 relative">
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value} type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={isActive}
            className={`relative z-10 px-2.5 h-7 text-[11px] font-medium rounded-[5px] cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 inline-flex items-center gap-1 ${
              isActive ? "text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[5px] bg-blue-600 shadow-[0_1px_2px_rgba(37,99,235,0.35)]"
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.6 }}
              />
            )}
            {opt.icon && (
              <span className="relative z-10"><Icon icon={opt.icon} width={11} height={11} /></span>
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

**Two visual variants** of this segmented control exist on the page:
- The **tab strip** in the filter bar uses `h-7` buttons with `text-[11px]` (subscribers/partners/inactive).
- The **MG-mode toggle** inside the Add Organization modal uses `h-8` buttons with `text-[12px]` and `gap-1.5`. Both reuse the same `motion.span` pattern with different `layoutId` strings (`"orgs-tab-pill"` vs `"add-org-mg-mode"`).

---

## 8. Header Row Pattern (Title + Stat Tiles)

The page header combines: an icon block + title + chips on the left, and a `grid-cols-3` of stat tiles on the right (3-up at desktop).

```tsx
<div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2">
  <div className="flex items-center gap-3 min-w-0 flex-1">
    {/* Page-icon tile (filled, not tinted) */}
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
      <Icon icon="solar:buildings-bold" width={20} height={20} />
    </div>

    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-[17px] font-bold text-slate-900 leading-tight">{t("title")}</h1>
        <Pill tone="primary" size="sm">
          <Icon icon="solar:users-group-rounded-bold" width={9} height={9} />
          {stats?.total ?? 0} active
        </Pill>
        {(orphanedData?.count ?? 0) > 0 && (
          <Pill tone="warning" size="sm">
            <Dot tone="warning" />
            {orphanedData?.count} orphan{orphanedData?.count === 1 ? "" : "s"}
          </Pill>
        )}
      </div>
      <p className="text-[12px] text-slate-500 mt-0.5">
        Manage platform tenants, vendors, and subscribers.{" "}
        <button
          type="button"
          onClick={() => setIsRulesModalOpen(true)}
          className="underline decoration-dashed decoration-slate-300 underline-offset-2 hover:text-slate-700 hover:decoration-slate-400 transition-colors cursor-pointer"
        >
          {t("deactivationRules")}
        </button>
      </p>
    </div>
  </div>

  {/* 3-up stat tile row */}
  <div className="grid grid-cols-3 gap-2 lg:w-[480px]">
    <StatTile label="Subscribers" value={30} hint="28 synced" icon="solar:users-group-rounded-bold" tone="primary" />
    <StatTile label="Partners"     value={2}  hint="1 vendor · 1 partner" icon="solar:hand-shake-bold" tone="violet" />
    <StatTile label="Health"       value="93%" hint="2 drift" icon="solar:shield-check-bold" tone="success" />
  </div>
</div>
```

**Key design rules**:
- The page-icon tile is a **filled, full-color** `bg-blue-600 text-white` (not a translucent tinted tile like in section headers). This is the only place you do this.
- Chips next to the title are **inline** with the title (`flex items-center gap-2 flex-wrap`).
- The subtitle can include an **inline text-button** (the dashed underline) to open a related modal without taking up toolbar real estate.
- Stat tiles are `grid-cols-3 gap-2` on mobile and `lg:w-[480px]` on desktop (fixed width so they don't squeeze the title block).

---

## 9. Action Toolbar Pattern

The toolbar is its own card (NOT inside the table card). It has three groups: **destructive** (left, amber/warning), **vertical separator**, **secondary** (middle, secondary/danger), then **primary CTA** (right, ml-auto).

```tsx
<div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
  <Button variant="warning" size="sm" onClick={handleBackfillMG} isLoading={isBackfillingMG}
    startIcon={<Icon icon="solar:database-bold" width={12} height={12} />}>
    Backfill MG
  </Button>
  {(orphanedData?.count ?? 0) > 0 && (
    <Pill tone="warning" size="sm">{orphanedData?.count}</Pill>
  )}

  <Button variant="warning" size="sm" onClick={handleBackfillOrgCode} isLoading={isBackfillingOrgCode}
    startIcon={<Icon icon="solar:hashtag-bold" width={12} height={12} />}>
    Backfill Org Code
  </Button>
  {(missingOrgCodeData?.count ?? 0) > 0 && (
    <Pill tone="warning" size="sm">{missingOrgCodeData?.count}</Pill>
  )}

  {/* Vertical separator */}
  <span className="mx-1 h-5 w-px bg-slate-200" />

  <Button variant="secondary" size="sm" onClick={handleGlobalSync} isLoading={isGlobalSyncing}
    startIcon={<Icon icon="solar:refresh-circle-bold" width={12} height={12} />}>
    Sync
  </Button>
  <Button variant="danger" size="sm" onClick={handleReconcile} isLoading={isReconciling}
    startIcon={<Icon icon="solar:shield-warning-bold" width={12} height={12} />}>
    Fix
  </Button>

  {/* Primary CTA pinned to the right */}
  <div className="ml-auto">
    <Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)}
      startIcon={<Icon icon="solar:add-circle-bold" width={12} height={12} />}>
      Add Organization
    </Button>
  </div>
</div>
```

**Key design rules**:
- Every button shows its `isLoading` spinner in place of `startIcon` (not both).
- A "count pill" can sit **inline** to the right of a button when the action has a relevant number (orphan count, missing code count). Pill is `tone="warning" size="sm"`.
- The vertical separator is `mx-1 h-5 w-px bg-slate-200` — short and slate, NOT a horizontal `<hr>`.
- The primary CTA lives in a `ml-auto` wrapper so it always hugs the right edge regardless of how many left-side buttons are present.

---

## 10. Tab Strip Pattern (Segmented Control with Sliding Pill)

Three tabs, single-active, with an animated `motion.span` that slides between buttons. Defined as a `FilterTabGroup` (see §7.8).

```tsx
type TabKey = "subscribers" | "partners" | "inactive";

const TAB_OPTIONS = [
  { value: "subscribers", label: "Subscribers",            icon: "solar:users-group-rounded-bold" },
  { value: "partners",    label: "Partners & Vendors",     icon: "solar:hand-shake-bold" },
  { value: "inactive",    label: "Inactive & Archived",    icon: "solar:shield-bold" },
];

<FilterTabGroup<TabKey>
  value={activeTab}
  onChange={setActiveTab}
  layoutId="orgs-tab-pill"
  options={TAB_OPTIONS.map((o) => ({ value: o.value, label: o.label, icon: o.icon }))}
/>
```

**Per-tab color** (carried into the `SectionHeader` accent and the count pill):
- Subscribers → `accent="primary"`, `tone="primary"`
- Partners & Vendors → `accent="violet"`, `tone="violet"`
- Inactive & Archived → `accent="danger"`, `tone="danger"`

This lets the page "recolor" the whole card when the user switches tabs (the section header icon and the count pill in the top-right both change color).

---

## 11. Table Card Pattern (SectionHeader + Filter Bar + Table + Footer)

```tsx
<Card className="flex flex-col flex-1 min-h-0">
  {/* L3a — Section header */}
  <SectionHeader
    icon={activeTabInfo.icon}
    title={...}
    subtitle={`${total} records · ${activeTabInfo.label.toLowerCase()}`}
    accent={activeTab === "subscribers" ? "primary" : activeTab === "partners" ? "violet" : "danger"}
    actions={<Pill tone="primary" size="sm"><Icon ... />{activeCount}</Pill>}
  />

  {/* L3b — Filter bar (tabs + refresh + search) */}
  <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">
    <FilterTabGroup ... />
    <IconButton onClick={handleRefresh} title="Refresh list">
      <Icon icon="solar:refresh-bold" width={14} height={14} className={isRefreshing ? "animate-spin text-blue-600" : undefined} />
    </IconButton>

    <div className="relative ml-auto min-w-[220px]">
      <Icon icon="solar:magnifer-linear" width={11} height={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text" value={search} onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search…"
        className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 cursor-text focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
      />
      {search && (
        <button onClick={() => handleSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
          <Icon icon="solar:close-circle-linear" width={11} height={11} />
        </button>
      )}
    </div>
  </div>

  {/* L3c — Table scroll region */}
  <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto">
    <AnimatePresence mode="wait" initial={false}>
      {isLoading ? <SkeletonRows /> : tenants.length === 0 ? <EmptyState /> : <DataTable rows={tenants} />}
    </AnimatePresence>
  </div>

  {/* L3d — Pagination footer */}
  {!isLoading && total > 0 && (
    <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-500 gap-3 flex-wrap">
      <span className="flex items-center gap-1.5">
        Showing <span className="font-semibold text-slate-700 tabular-nums">{showingFrom}</span>
        {" - "}
        <span className="font-semibold text-slate-700 tabular-nums">{showingTo}</span> of
        <span className="font-semibold text-slate-700 tabular-nums">{total}</span> record{total === 1 ? "" : "s"}
        <span className="mx-1 text-slate-300">/</span>
        <Dot tone="primary" /> Page {page} of {pageCount}
      </span>
      {pageCount > 1 && (
        <span className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={...} disabled={page <= 1}
            startIcon={<Icon icon="solar:alt-arrow-left-linear" width={12} height={12} />}>Prev</Button>
          <span className="px-2 text-[11px] tabular-nums text-slate-700">
            <span className="font-semibold">{page}</span><span className="text-slate-400"> / {pageCount}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={...} disabled={page >= pageCount}
            endIcon={<Icon icon="solar:alt-arrow-right-linear" width={12} height={12} />}>Next</Button>
        </span>
      )}
    </div>
  )}
</Card>
```

**Filter bar composition** (left to right):
1. `FilterTabGroup` (segmented tabs)
2. `IconButton` (refresh — icon spins when loading)
3. Search input pushed to the right via `ml-auto min-w-[220px]`
4. Search input has a clear (×) button when value is non-empty

**Search input anatomy**:
- `h-8` (compact, matches filter pills)
- Left icon at `left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none`
- `pl-7 pr-7` to clear the icon
- Focus state: `focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300` (a **1px** slate ring, not the blue ring used elsewhere — search is a quieter control)
- Clear button at `right-2 top-1/2 -translate-y-1/2`

**Table thead anatomy**:
```tsx
<thead>
  <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] uppercase tracking-[0.06em] text-slate-500 font-semibold">
    <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-left">…</th>
    <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-3 py-2 text-left">…</th>
    …
    <th className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-5 py-2 text-right">Actions</th>
  </tr>
</thead>
```

**Key rules**:
- The `<thead>` is **sticky** (`sticky top-0 z-10`) so column headers stay visible when the user scrolls a long list.
- The sticky background uses `bg-slate-50/95 backdrop-blur-sm` — a translucent slate with blur, so rows scrolling under the header feel frosted (not hard-cut).
- First and last columns get `px-5`; middle columns get `px-3`.
- All `<th>` text uses the uppercase micro-label style.

---

## 12. Per-Row Layout (Avatar, Truncate, Pill Stack, Action Cluster)

The row follows a 7-column flex table where each cell is its own `<td>`:

| Column | Class | Content |
|---|---|---|
| Organization | `px-5 py-2.5` | `[icon-tile 32×32] [name + ID hint]` |
| Org code | `px-3 py-2.5` | Monospace chip with copy icon (click to copy) |
| Clerk ID | `px-3 py-2.5` | Monospace truncated, copy on hover |
| Service type (partners only) | `px-3 py-2.5` | Stack of colored `Pill` chips |
| Metrics | `px-3 py-2.5` | `[users-icon] N · [car-icon] N` |
| Created date | `px-3 py-2.5` | `formatSystemAdminDate(...)` (YYYY/MM/DD) |
| Sync status | `px-3 py-2.5` | `StatusBadge` (success/danger pill with dot) |
| Actions | `px-5 py-2.5` | Icon cluster (right-aligned, opacity 0.7 → 1 on row hover) |

### Organization cell — the canonical "avatar + name + id" row

```tsx
<td className="px-5 py-2.5">
  <div className="flex items-center gap-3 min-w-0">
    {/* 32×32 tinted icon tile */}
    <div className="flex-shrink-0 w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-slate-500">
      <Icon icon="solar:buildings-bold" width={14} height={14} />
    </div>
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-slate-900 truncate max-w-[180px]" title={tenant.name}>
        {tenant.name}
      </p>
      <p className="text-[10px] text-slate-500 font-mono">ID: {tenant.id.slice(0, 12)}</p>
    </div>
  </div>
</td>
```

**Key rules**:
- The `flex items-center gap-3 min-w-0` on the inner div lets the name truncate. Without `min-w-0`, flex children default to `min-content` width and the truncate silently fails.
- `max-w-[180px]` caps the name column so a very long name doesn't dominate the row.
- `title` attribute on the `<p>` makes the full name available on hover.

### Copyable code cell

```tsx
<td className="px-3 py-2.5">
  {tenant.organizationCode ? (
    <button
      type="button"
      onClick={() => handleCopy(tenant.organizationCode!)}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer"
    >
      {tenant.organizationCode}
      <Icon icon="solar:copy-linear" width={9} height={9} />
    </button>
  ) : (
    <span className="text-[11px] text-slate-400">{"\u2014"}</span>
  )}
</td>
```

The copy-on-hover pattern uses **`solar:copy-linear`** at 9×9. The chip background turns `hover:bg-blue-50 hover:text-blue-700` (the standard "interactive mono chip" treatment).

### Actions cluster — icon buttons in a row

```tsx
<td className="px-5 py-2.5">
  <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
    <IconButton onClick={...} title="View details">
      <Icon icon="solar:eye-linear" width={13} height={13} />
    </IconButton>
    <IconButton onClick={...} title="Edit organization">
      <Icon icon="solar:pen-linear" width={13} height={13} />
    </IconButton>
    <IconButton onClick={...} title="Deactivate organization" variant="danger">
      <Icon icon="solar:power-bold" width={13} height={13} />
    </IconButton>
    <IconButton onClick={...} title="Force sync memberships" variant="warning">
      <Icon icon="solar:refresh-circle-bold" width={13} height={13} />
    </IconButton>
  </div>
</td>
```

**Key rules**:
- The whole cluster sits at `opacity-70` by default and lifts to `opacity-100` on row hover (`group-hover:opacity-100 transition-opacity`).
- Add `group` to the parent `<tr className="hover:bg-slate-50/50 transition-colors group">`.
- `justify-end` so the icons hug the right edge.
- `gap-1` is tight — these are toolbuttons, not full buttons.

---

## 13. Empty / Loading / Error States

The three states live in an `<AnimatePresence mode="wait">` keyed by `filterSignature` so they cross-fade cleanly when the filter changes.

### Skeleton rows (cold load)

```tsx
<motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
  transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}>
  <div className="divide-y divide-slate-100">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-5 py-3">
        <div className="h-7 w-7 rounded-md bg-slate-100 animate-pulse" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-40 bg-slate-100 rounded animate-pulse" />
          <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="h-5 w-16 bg-slate-100 rounded animate-pulse" />
        <div className="h-5 w-12 bg-slate-100 rounded animate-pulse" />
      </div>
    ))}
  </div>
</motion.div>
```

**Skeleton rules**:
- 6 rows by default.
- Each row is a `flex items-center gap-3` with: 28×28 square, two-line text block (40w / 24w), two chip-sized bars (16w / 12w).
- Every bar is `bg-slate-100 rounded animate-pulse`. **No library.** No `Skeleton` import from anywhere.
- `divide-y divide-slate-100` between rows.

### Empty state

```tsx
<motion.div key={`empty:${filterSignature}`}
  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
  transition={{ duration: TAB_FADE_DURATION, ease: ANIMATION_EASE }}>
  <div className="flex flex-col items-center gap-2 py-12 px-5">
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
      <Icon icon="solar:folder-open-broken" width={20} height={20} />
    </div>
    <p className="text-[13px] font-medium text-slate-700">{t("noOrganizationsFound")}</p>
    <p className="text-[11px] text-slate-500 text-center max-w-sm">
      {debouncedSearch
        ? "Try a different search term, or switch tabs."
        : activeTab === "inactive"
          ? "No archived organizations yet."
          : "Add the first organization to get started."}
    </p>
  </div>
</motion.div>
```

**Empty-state rules**:
- `py-12` (48px) vertical padding so the empty state is centered in the card.
- A single 40×40 **round** (not rounded-md) icon container, `bg-slate-100 text-slate-400`.
- Title (`13px medium`) + subtitle (`11px slate-500`).
- Subtitle is conditional on the filter context (search term / tab).

---

## 14. Modal Chrome (Hand-Coded, Not HeroUI)

The Add Organization modal is the canonical modal pattern. **Every modal in the project should follow this template.** No HeroUI imports anywhere.

### Modal wrapper (backdrop + container)

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      key="add-org-backdrop"
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: MODAL_FADE, ease: EASE }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-[1400px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-visible flex flex-col dark:bg-slate-900 dark:border-slate-800"
        initial={{ opacity: 0, y: MODAL_SLIDE }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: MODAL_SLIDE }}
        transition={{ duration: MODAL_FADE, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="add-org-title" aria-busy={isLoading || undefined}
      >
        <ComponentDebugBadge componentName="AddOrganizationModal" isSystemAdmin portalToBody />
        {/* Header, Body, Footer slots here */}
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

**Key rules**:
- **Backdrop click closes** the modal (`onClick={onClose}` on the outer `motion.div`).
- **Click inside the modal does not close** (`onClick={(e) => e.stopPropagation()}` on the inner `motion.div`).
- Modal is `overflow-visible` so nested portaled panels (dropdowns, popovers) can bleed past the edge without being clipped. **Inner sub-cards that need to clip their own contents must use `overflow-hidden` themselves.**
- The `ComponentDebugBadge` is the **first child** so it sits at the very top of the DOM tree (and is portaled to `<body>` so it's never trapped by the modal's overflow).
- `aria-modal="true"`, `aria-labelledby` points at the title `<h2>`'s id, `aria-busy={isLoading}` is set while submitting.

### Modal header

```tsx
<div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 rounded-t-xl bg-white dark:bg-slate-900 dark:border-slate-800/60">
  {/* 36×36 tinted icon tile (NOT filled — translucent) */}
  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
    <Icon icon="solar:buildings-bold" width={18} height={18} />
  </div>
  <div className="flex-1 min-w-0">
    <h2 id="add-org-title" className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{t("title")}</h2>
    <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">{t("subtitle")}</p>
  </div>
  <button
    type="button" aria-label="Close" onClick={onClose}
    className="inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-slate-100 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
  >
    <Icon icon="solar:close-circle-bold" width={14} height={14} />
  </button>
</div>
```

**Key rules**:
- The icon tile is **36×36** (`h-9 w-9`) with a **translucent tinted** background (NOT filled like the page header). This is the difference between a "page header" tile and a "section header" tile.
- The header has its own `rounded-t-xl` because the modal shell is `overflow-visible` — the shell's rounded corners would otherwise not apply to the header strip.
- The close button is `h-7 w-7` (28×28) with `solar:close-circle-bold` at 14×14.
- The `id` on the `<h2>` is what `aria-labelledby` on the dialog container points at.

### Modal footer (handled in §21)

---

## 15. 3-Column Form Layout (Add Organization)

The Add Organization modal uses a `grid-cols-[minmax(0,25fr)_minmax(0,50fr)_minmax(0,25fr)]` to give Column 2 (org details + roles) the most space.

```tsx
<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,25fr)_minmax(0,50fr)_minmax(0,25fr)] gap-4 px-5 py-5 h-[70vh] min-h-0 dark:scrollbar-thin items-stretch overflow-hidden">
  {/* Column 1 — Management Group */}
  <div className="flex flex-col h-full min-h-0">…</div>

  {/* Column 2 — Org details + roles */}
  <div className="flex flex-col h-full min-h-0 gap-4 overflow-y-auto overflow-x-clip dark:scrollbar-thin pr-1">…</div>

  {/* Column 3 — Add First User */}
  <div className="flex flex-col h-full min-h-0">…</div>
</div>
```

**Critical grid setup notes** (from the source comment lines 757-770 — **read these before reusing**):

1. **Use `minmax(0, Nfr)`, not raw `%`.** Percent tracks resolve against the grid's *content* box, so `30% + 50% + 20%` = 100% BEFORE the 2 gaps (32px) and the `px-5` padding (40px) are added — that overflowed the grid by 72px and pushed column 3 outside the modal's right edge, where `overflow-hidden` clipped it. `fr` units divide the space *remaining* after gaps/padding, so the tracks fit exactly inside the padding box.

2. **`minmax(0, ...)` lets each column shrink** below its content's intrinsic min-width, preventing long org names from re-inflating the row.

3. **Per-column scroll contract**: the grid is `h-[70vh] min-h-0`. Each column wrapper is `flex flex-col h-full min-h-0`. The actual scroll region lives **inside the column** (not the column wrapper, not the grid). The header and toggle stay pinned.

4. **For Column 2 specifically**: `overflow-y-auto overflow-x-clip` — Y scrolls, X is clipped (so the portaled Vendor Service Type panel is never trapped horizontally).

5. **For sub-cards inside columns**: the sub-card itself carries `overflow-hidden` so the colored background clips to the rounded corners. The form fields live in a `flex-1 min-h-0 overflow-y-auto` region inside the card.

### Column → Sub-Card anatomy

Every sub-card inside a column follows this three-part pattern:

```tsx
<div className="rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
  {/* 1. Pinned header (does NOT scroll) */}
  <div className="px-4 py-3 border-b border-slate-200/70 dark:border-slate-700/60">
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-{tone}-50 text-{tone}-600 ring-1 ring-inset ring-{tone}-100 shrink-0 dark:bg-{tone}-950/40 dark:text-{tone}-300 dark:ring-{tone}-800/50">
        <Icon icon="solar:graph-new-up-bold-duotone" width={14} height={14} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">{heading}</h3>
        <p className="text-[11px] text-slate-500 leading-snug dark:text-slate-400">{hint}</p>
      </div>
    </div>
  </div>

  {/* 2. Scrollable body */}
  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-clip dark:scrollbar-thin px-4 pb-4 pt-3.5">
    {/* form fields */}
  </div>
</div>
```

**Icon-tile sizes inside sub-cards**:
- Sub-card title: `h-7 w-7` (28×28), icon `14×14`
- Modal header: `h-9 w-9` (36×36), icon `18×18`
- Section header (page chrome): `h-9 w-9` (36×36), icon `18×18`
- Page header (logo): `h-10 w-10` (40×40), icon `20×20`

---

## 16. Form Field Primitives (LabeledInput, UserField, Select)

The modal uses three form-field primitives. Pick the right one for each context.

### 16.1 `LabeledInput` — Default for grid-laid-out form fields (column 2)

```tsx
function LabeledInput({
  id, label, value, onChange, placeholder, type = "text",
  autoComplete = "off", inputMode,
}: {
  id: string; label: string; value: string; onChange: (next: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url";
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "url";
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-1 dark:text-slate-400">
        {label}
      </label>
      <input
        id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} spellCheck={false}
        className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
      />
    </div>
  );
}
```

**Specs**:
- `h-9` (36px tall).
- `text-[13px] font-medium` (one step larger than body, because it's an editable field).
- Focus: `focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40` (a 2px translucent blue ring, the standard "I'm editing" treatment).
- Label is **uppercase micro-label** style, sitting above the input.
- Use this in `grid-cols-2` layouts where you need the label/input pair to align with neighbors.

### 16.2 `UserField` — Compact field for the Add First User column

The right column is denser than the center column, so its inputs are tighter.

```tsx
function UserField({
  label, value, onChange, placeholder, type = "text", icon, hint, error,
  endAdornment, maxLength, autoComplete, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; icon?: string; hint?: string; error?: string;
  endAdornment?: React.ReactNode; maxLength?: number;
  autoComplete?: string; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <Icon icon={icon} width={12} height={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        )}
        <input
          type={type} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} maxLength={maxLength} autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          className={`w-full h-8 rounded-md border pl-7 pr-7 text-[12px] font-medium text-slate-700 placeholder:text-slate-400 placeholder:font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-200 dark:placeholder:text-slate-500 ${
            icon ? "" : "pl-2.5 "
          }${
            error ? "border-rose-300 dark:border-rose-800/70" : "border-slate-200 dark:border-slate-700"
          } bg-white dark:bg-slate-900`}
        />
        {endAdornment && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{endAdornment}</div>}
      </div>
      {error ? (
        <p className="text-[10.5px] text-rose-600 dark:text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-[10.5px] text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}
```

**Specs** (differences from `LabeledInput`):
- `h-8` (32px tall — denser).
- `text-[12px] font-medium` (matches body, since the right column is compact).
- Label is `text-[11px] font-medium` (sentence case, NOT uppercase) with a `text-rose-500 *` for required.
- Optional left icon (`solar:user-id-linear`, `solar:letter-linear`, `solar:lock-keyhole-bold`).
- Optional right adornment (e.g. the eye toggle on password fields — see `UserPasswordToggle` in §20.4).
- Error/hint message is **inline below** the input — a single 10.5px line. Error is `text-rose-600`, hint is `text-slate-500`.
- Focus uses `focus-visible:ring-2 focus-visible:ring-blue-400` (the universal focus ring, NOT a border-color change).

### 16.3 Native `<select>` (fiscal year start)

Sometimes a native `<select>` is appropriate (small fixed set, no search needed).

```tsx
<select
  id="add-org-fiscal-year"
  value={fiscalYearStartMonth}
  onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))}
  className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
>
  <option value="" disabled>{t("selectMonth")}</option>
  {monthOptions.map((opt) => (
    <option key={opt.value} value={opt.value}>{opt.label}</option>
  ))}
</select>
```

Use a native `<select>` **only** when:
- The set is small (≤ ~24 options).
- The options don't need icons or rich content.
- Search/filter isn't needed.

For everything else (vendor types, password length, anything multi-select), use a **portaled custom dropdown** (§20).

### 16.4 Two-column row layout

```tsx
<div className="grid grid-cols-2 gap-2">
  <LabeledInput id="…" label="…" value={…} onChange={…} placeholder="…" />
  <LabeledInput id="…" label="…" value={…} onChange={…} placeholder="…" />
</div>

<div className="col-span-2">  {/* full-width inside the grid */}
  <LabeledInput id="…" label="…" value={…} onChange={…} placeholder="…" />
</div>
```

`gap-2` between fields, `col-span-2` for fields that should break to full width inside a 2-col grid.

---

## 17. Role / Toggle Cards (Multi-Select Pill-Buttons)

Used for **Organization Roles** (left of Column 2) and **Account Type** + **Permission Tier** (right column). A vertical stack of selectable cards. Selected cards get a colored ring; unselected stay neutral.

```tsx
{ROLE_DEFS.map((role) => {
  const isSelected = roles.includes(role.value);
  const accentBg = {
    primary: isSelected
      ? "bg-blue-50 ring-blue-200/70 dark:bg-blue-950/40 dark:ring-blue-800/50"
      : "bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700",
    secondary: isSelected
      ? "bg-violet-50 ring-violet-200/70 dark:bg-violet-950/40 dark:ring-violet-800/50"
      : "bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700",
  } as const;
  const accentIcon = {
    primary: "bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
    secondary: "bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300",
  } as const;
  return (
    <button
      key={role.value} type="button"
      onClick={() => toggleRole(role.value)}
      aria-pressed={isSelected}
      className={`relative flex items-start gap-3 p-3 rounded-lg border text-left cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${accentBg[role.accent]}`}
    >
      <div className={`p-1.5 rounded-md shrink-0 ${accentIcon[role.accent]}`}>
        <Icon icon={role.icon} width={14} height={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[12.5px] font-semibold ${
            isSelected ? "text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"
          }`}>{t(role.labelKey)}</span>
          {isSelected && (
            <Icon icon="solar:check-circle-bold" width={14} height={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug dark:text-slate-400">{t(role.descKey)}</p>
      </div>
    </button>
  );
})}
```

**Key rules**:
- The selected state has a **tinted background + matching ring** (e.g. `bg-blue-50 ring-blue-200/70`). The unselected state is white + slate ring.
- The icon tile inside the card recolors: muted when unselected, full-tone when selected.
- A check icon (`solar:check-circle-bold` at 14×14) appears top-right when selected.
- The card is `p-3` with a `flex items-start gap-3` layout. The right column has a denser version with `p-2.5 gap-2.5` and 13×13 icons.
- Stack with `flex flex-col gap-2` (left column) or `gap-1.5` (right column, denser).

### Suggested badge (right column only)

Account type rows can show a small emerald "Suggested" pill when the choice matches the org roles selected in the left column:

```tsx
{isSuggested && (
  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.06em] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 shrink-0 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800/50">
    {t("userSuggestedBadge")}
  </span>
)}
```

### Inline blocker (submit-readiness hint)

When the operator has filled something invalid, show a single amber callout under the right column's form:

```tsx
{blocker && (
  <div className="shrink-0 flex items-start gap-2 px-2.5 py-2 rounded-md border border-amber-200/70 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30">
    <Icon icon="solar:shield-warning-bold-duotone" width={13} height={13} className="text-amber-600 dark:text-amber-400 shrink-0 mt-px" />
    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">{blocker}</p>
  </div>
)}
```

This is **the same** inline-blocker pattern the operator sees on the rest of the modal — it doesn't replace the toast, it primes them for why the submit button is disabled.

---

## 18. Mirror Preview Block (Read-Only Summary)

When the operator checks **"Use same name as organization"** on the Management Group card, the modal shows a read-only preview of what will be cloned to the MG. This is a hand-coded data-display block, not a form.

```tsx
<div className="rounded-lg border border-slate-200/80 bg-white dark:bg-slate-900/40 dark:border-slate-700/60 overflow-hidden">
  {/* Block header */}
  <div className="px-3 pt-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800/60">
    <p className="text-[9.5px] uppercase tracking-[0.08em] font-semibold text-slate-400 dark:text-slate-500 leading-none mb-1.5">
      {tMgPicker("mirrorPreviewHeading")}
    </p>
    {name.trim() ? (
      <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 leading-tight truncate">
        {name.trim()}
      </p>
    ) : (
      <p className="text-[14px] text-slate-400 dark:text-slate-500 leading-tight">
        {tMgPicker("mirrorPreviewEmpty")}
      </p>
    )}
  </div>

  {/* 7 CRM fields — clean data rows */}
  <dl className="px-3 py-1.5 space-y-0">
    {rows.map((row) => (
      <div key={row.label} className="flex items-baseline justify-between gap-3 py-1 border-t border-slate-100 dark:border-slate-800/60 first:border-t-0">
        <dt className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400 leading-tight shrink-0 w-28 truncate">
          {row.label}
        </dt>
        <dd className={row.value
          ? "text-[12px] font-semibold text-slate-800 dark:text-slate-100 text-right leading-tight truncate"
          : "text-[12px] text-slate-400 dark:text-slate-500 text-right leading-tight"
        }>
          {row.value || tMgPicker("mirrorPreviewEmpty")}
        </dd>
      </div>
    ))}
  </dl>
</div>
```

**Key rules**:
- The MG name is the block's **subject** — it's the headline, 14px semibold, at the top.
- Each row is a `<dl>` definition: label on the left (10.5px slate-500, fixed width 28, truncate), value on the right (12px semibold slate-800, right-aligned, truncate).
- Empty values fall back to a single em-dash placeholder (translated).
- The first row has no top border (`first:border-t-0`).

---

## 19. MG Search Result Row + Selected Card

### MgResultRow (search result)

```tsx
<button
  type="button"
  onClick={onPick}
  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border text-left cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
    isSelected
      ? "bg-blue-50 border-blue-200/70 dark:bg-blue-950/40 dark:border-blue-800/50"
      : "bg-white border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
  }`}
>
  <div className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset shrink-0 ${
    isSelected ? "bg-blue-100 text-blue-600 ring-blue-200/70 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800/50"
               : "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600"
  }`}>
    <Icon icon="solar:graph-new-up-bold-duotone" width={13} height={13} />
  </div>
  <div className="flex-1 min-w-0">
    <p className="text-[12.5px] font-semibold text-slate-900 truncate dark:text-slate-100">{mg.name}</p>
    <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
      <span className="font-mono">{mg.managementGroupShortCode ?? mg.code}</span>
      <span className="text-slate-300 dark:text-slate-600">·</span>
      <span>{tMgPicker("bindTenantCount", { count: mg.tenantCount })}</span>
      {mg.hasPersonalMirror && (
        <>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="inline-flex items-center gap-0.5 text-violet-600 dark:text-violet-400">
            <Icon icon="solar:user-circle-linear" width={9} height={9} />
            {tMgPicker("bindPersonalMirrorHint")}
          </span>
        </>
      )}
    </div>
  </div>
  {isSelected
    ? <Icon icon="solar:check-circle-bold" width={16} height={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
    : <Icon icon="solar:alt-arrow-right-linear" width={13} height={13} className="text-slate-400 shrink-0" />}
</button>
```

### SelectedMgCard (when an MG has been picked)

```tsx
<div className="rounded-md border border-blue-200/70 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-800/50 overflow-hidden">
  <div className="flex items-center gap-2.5 px-2.5 py-2">
    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100 text-blue-600 ring-1 ring-inset ring-blue-200/70 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800/50 shrink-0">
      <Icon icon="solar:graph-new-up-bold-duotone" width={13} height={13} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-[12.5px] font-semibold text-slate-900 truncate dark:text-slate-100">{mg.name}</p>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-[0.06em] bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
          {tMgPicker("bindSelected")}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-slate-600 dark:text-slate-400">
        <span className="font-mono">{mg.managementGroupShortCode ?? mg.code}</span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span>{tMgPicker("bindTenantCount", { count: mg.tenantCount })}</span>
      </div>
    </div>
    <button onClick={onClear} className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-blue-100 text-slate-500 hover:text-slate-700 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
      <Icon icon="solar:close-circle-bold" width={12} height={12} />
    </button>
  </div>
</div>
```

**Key rules**:
- The selected card always has a small "SELECTED" badge in the top-right (9.5px bold uppercase blue-100/blue-700).
- The clear button (`solar:close-circle-bold` at 12×12) sits in the top-right.
- A "Personal mirror" hint (violet-600) shows when the MG is the personal mirror — `solar:user-circle-linear` at 9×9.

---

## 20. Custom Portaled Dropdown Pattern

**This is the most important pattern to get right.** Whenever a dropdown panel would otherwise be clipped by an `overflow: hidden` / `auto` / `scroll` ancestor (the modal shell, a scroll column, a sticky thead), the panel must be **portaled to `document.body`** with `position: fixed` coordinates derived from the trigger's bounding rect.

The organizations page has two portaled dropdowns:
1. **`VendorTypeMultiSelect`** — multi-select vendor service types (portaled because the modal shell + middle column are scroll containers).
2. **`UserMiniSelect`** — password-length selector (portaled because the right column is a scroll container).

### 20.1 The escape strategy (read before building)

From `custom-dropdown-overflow-law.mdc` §3.3:
- The modal shell is `overflow-hidden` and the middle column is `overflow-y-auto`, both of which would silently clip an absolutely positioned panel.
- So the panel is **PORTALED** to `document.body` with `position: fixed` coordinates derived from the trigger's `getBoundingClientRect()`, and `z-index: 60` (above the modal shell's `z-50`).
- The rect is recomputed on scroll (capture phase, catches every scrollable ancestor) and resize while open.
- Click-outside checks BOTH the trigger ref and the panel ref, since the portaled panel is not a DOM descendant of the trigger.
- The panel itself is `overflow-hidden` so each selected option's colored background is clipped to the panel's rounded corners (shadows are unaffected by `overflow-hidden` on the same element).

### 20.2 VendorTypeMultiSelect — full example

```tsx
function VendorTypeMultiSelect({ value, onChange }: {
  value: Set<VendorType>;
  onChange: (next: Set<VendorType>) => void;
}) {
  const t = useTranslations("admin.addOrganizationModal");
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef   = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // Avoid SSR/hydration mismatch — only mount the portal on the client.
  useEffect(() => setMounted(true), []);

  // Keep the panel anchored to the trigger while open.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 6, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);  // capture phase
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Close on outside click — check BOTH refs.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ... options, summary, toggle ...

  return (
    <div>
      <span className="text-[11px] uppercase tracking-[0.06em] font-semibold text-slate-500 block mb-2 dark:text-slate-400">
        {t("vendorServiceType")}
      </span>

      <div ref={triggerRef} className="relative">
        {/* Trigger button */}
        <button
          type="button" onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox" aria-expanded={open}
          className="w-full inline-flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-white text-left cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:bg-slate-900 dark:border-slate-700"
        >
          {/* …icon + summary + count badge + chevron… */}
        </button>

        {/* Portaled panel */}
        {mounted && createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={panelRef}
                role="listbox" aria-multiselectable="true"
                style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 60 }}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14, ease: EASE }}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
              >
                {options.map((o) => {
                  const isSelected = value.has(o.value);
                  return (
                    <button
                      key={o.value} type="button" role="option" aria-selected={isSelected}
                      onClick={() => toggle(o.value)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 text-left cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${
                        isSelected
                          ? "bg-violet-50 dark:bg-violet-950/40"
                          : "hover:bg-slate-50 dark:hover:bg-slate-700/60"
                      }`}
                    >
                      {/* …icon + label + check… */}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
      </div>

      {/* Help text below the dropdown */}
      <p className="text-[11px] text-slate-500 mt-1.5 dark:text-slate-400">{t("vendorTypeHelpMultiple")}</p>
    </div>
  );
}
```

### 20.3 The user mini-select (password length)

The `UserMiniSelect` is the same pattern at a smaller scale (`h-6` trigger, no icons in the trigger, smaller `min-width` panel). Use it for any compact inline control.

### 20.4 UserPasswordToggle (eye / eye-off adornment)

```tsx
function UserPasswordToggle({ visible, onToggle, label }: {
  visible: boolean; onToggle: () => void; label: string;
}) {
  return (
    <button
      type="button" onClick={onToggle} aria-label={label} aria-pressed={visible}
      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <Icon icon={visible ? "solar:eye-bold" : "solar:eye-closed-bold"} width={13} height={13} />
    </button>
  );
}
```

Wired into `UserField` via the `endAdornment` prop, anchored at `right-1.5 top-1/2 -translate-y-1/2`.

---

## 21. Modal Footer (Cancel + Primary)

```tsx
<div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-800/60">
  {/* Left: status hint (e.g. "Bound to MG: Acme (OF-MG-XYZ)" or "MG name: …") */}
  <span className="text-[10.5px] text-slate-500 truncate dark:text-slate-400">
    {footerHint}
  </span>

  {/* Right: Cancel + Primary CTA */}
  <div className="flex items-center gap-2 shrink-0">
    <button
      type="button" onClick={onClose}
      className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-transparent font-medium text-[12px] text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {tCommon("cancel")}
    </button>
    <button
      type="button" onClick={() => void handleCreate()} disabled={isLoading || !canSubmit}
      className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-blue-600 bg-blue-600 hover:bg-blue-700 font-medium text-[12px] text-white shadow-sm cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading
        ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        : <Icon icon="solar:add-circle-bold" width={12} height={12} />}
      {t("createOrganization")}
    </button>
  </div>
</div>
```

**Key rules**:
- Footer has its own `rounded-b-xl` because the modal shell is `overflow-visible`.
- Background is a **soft slate** (`bg-slate-50/40`) so the footer reads as a "footer band" without a hard border.
- Cancel button: **ghost** style (no border, transparent background, hover `bg-slate-100`).
- Primary CTA: **blue-600 filled, blue-600 border** (`shadow-sm`).
- The primary button's `startIcon` swaps to a spinner when `isLoading`.
- Both buttons are `h-8` (32px) — smaller than the page-chrome buttons (`h-9`) because the modal is denser.
- The left side of the footer can host a **status hint** (which MG is selected, what name will be used, etc.) — `text-[10.5px] text-slate-500 truncate`.

---

## 22. Iconography — Solar Icon Set (AsyncIcon)

All icons in the project use **`AsyncIcon`** from `@/components/ui/shared/AsyncIcon`. Never import `@iconify/react` directly.

```tsx
import { AsyncIcon as Icon } from "@/components/ui/shared/AsyncIcon";

<Icon icon="solar:buildings-bold" width={20} height={20} />
```

The icon name format is `solar:{name}-{style}`. Style values: `linear`, `bold`, `bold-duotone`, `broken`. Width and height are passed as numbers (not Tailwind classes).

### Icon size chart (from the page)

| Context | Size | Examples |
|---|---|---|
| Page header logo | 20×20 | `solar:buildings-bold` |
| Modal header | 18×18 | `solar:buildings-bold` |
| Section header (page chrome) | 18×18 | varies |
| Sub-card title (modal) | 14×14 | `solar:graph-new-up-bold-duotone`, `solar:user-id-bold-duotone` |
| Button start icon | 12×12 | `solar:database-bold`, `solar:hashtag-bold` |
| Filter bar icon | 11×11 | `solar:magnifer-linear` |
| Pill icon (size=sm) | 9×9 | `solar:users-group-rounded-bold` |
| Action button icon (table) | 13×13 | `solar:eye-linear`, `solar:pen-linear`, `solar:power-bold` |
| Selected-card check | 14–16 | `solar:check-circle-bold` |
| Search input icon | 11×11 | `solar:magnifer-linear` |
| Clear (×) icon | 11×11 | `solar:close-circle-linear` |
| Refresh icon (spinning) | 14×14 | `solar:refresh-bold` |
| Mini-tag icon | 9×9 | `solar:user-circle-linear` |

### Icons actually used on the organizations page

| Icon name | Where |
|---|---|
| `solar:buildings-bold` | Page header, org row avatar |
| `solar:users-group-rounded-bold` | Header pill, subscribers stat, metrics |
| `solar:hand-shake-bold` | Partners tab, partners stat |
| `solar:shield-check-bold` | Health stat |
| `solar:shield-bold` | Inactive tab |
| `solar:database-bold` | Backfill MG button |
| `solar:hashtag-bold` | Backfill Org Code button |
| `solar:refresh-circle-bold` | Sync button, sync action |
| `solar:shield-warning-bold` | Fix button, blocker warning |
| `solar:add-circle-bold` | Add Organization button, primary CTA |
| `solar:magnifer-linear` | Search input |
| `solar:close-circle-linear` | Search clear |
| `solar:close-circle-bold` | Modal close, MG clear |
| `solar:refresh-bold` | Refresh list icon button |
| `solar:eye-linear` | View details action |
| `solar:pen-linear` | Edit action |
| `solar:power-bold` | Deactivate action |
| `solar:restart-circle-bold` | Restore action |
| `solar:copy-linear` | Copy org code / clerk id |
| `solar:check-circle-bold` | Selected role / selected MG / selected permission |
| `solar:alt-arrow-left-linear` | Pagination prev |
| `solar:alt-arrow-right-linear` | Pagination next, MG row chevron |
| `solar:alt-arrow-down-linear` | Dropdown chevron (rotates 180° when open) |
| `solar:folder-open-broken` | Empty state |
| `solar:graph-new-up-bold-duotone` | MG sub-card, MG row avatar |
| `solar:user-id-bold-duotone` | Org Details sub-card, Org row avatar |
| `solar:user-plus-bold-duotone` | Add First User sub-card |
| `solar:user-id-linear` | Username field icon |
| `solar:letter-linear` | Email field icon |
| `solar:lock-keyhole-bold` | Password field icon |
| `solar:shield-keyhole-bold-duotone` | Permission tier row icon |
| `solar:user-circle-bold-duotone` | Subscriber role/account-type icon |
| `solar:shop-bold-duotone` | Vendor role/account-type icon |
| `solar:user-circle-linear` | Personal-mirror hint |
| `solar:eye-bold` / `solar:eye-closed-bold` | Password show/hide |
| `solar:widget-bold` / `solar:widget-linear` | Vendor-type dropdown trigger |
| `solar:wrench-linear` | SERVICE vendor type |
| `solar:box-linear` | PARTS vendor type |
| `solar:gas-station-linear` | FUEL vendor type |
| `solar:shield-check-linear` | INSURANCE vendor type |
| `solar:file-text-linear` | LEASING vendor type |
| `solar:menu-dots-circle-linear` | OTHER vendor type |
| `solar:add-square-bold-duotone` | MG mode "Create" |
| `solar:link-bold` | MG mode "Bind" |
| `solar:restart-bold` | Auto-generate password |

---

## 23. Focus Ring Convention (Universal)

**Every** interactive element in this project uses the same focus ring:

```
focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
```

| Context | Class string |
|---|---|
| Buttons (page chrome + modal + table) | `focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400` |
| IconButtons | same |
| Inputs / text fields | `focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400` (or `focus:ring-2 focus:ring-blue-400/40` on the form-style inputs) |
| Dropdown panels | `focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400` (the `inset` variant) |
| Search input | `focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300` (a quieter 1px slate ring) |

**Why `focus-visible:` instead of `focus:`**: `focus:` fires on every click, drawing a competing frame around the button; `focus-visible:` fires only on keyboard navigation, preserving the visual cleanliness of click interactions. The "click draws a frame" bug is a recurring class of issue — see the section 3.12 incident table in `design-law.mdc`.

**The search input is the only exception** — it uses a 1px slate ring because the blue ring would compete with the surrounding filter pills and stat tiles.

---

## 24. Dark Mode Cheat Sheet

Every visible surface must have a `dark:` variant. The patterns below are taken verbatim from the page. When in doubt, default to a **deeper, translucent** counterpart (the operator console's dark mode is "matte", not "OLED black").

| Light | Dark |
|---|---|
| `bg-white` | `dark:bg-slate-900` or `dark:bg-slate-900/40` (for tinted sub-cards) |
| `bg-slate-50/40` | `dark:bg-slate-900/40` |
| `bg-slate-50/60` | `dark:bg-slate-900/60` |
| `bg-slate-100` | `dark:bg-slate-800` |
| `border-slate-200` | `dark:border-slate-700` or `dark:border-slate-700/60` |
| `border-slate-200/70` | `dark:border-slate-700/60` |
| `border-slate-100` | `dark:border-slate-800/60` |
| `text-slate-900` | `dark:text-slate-100` |
| `text-slate-700` | `dark:text-slate-200` |
| `text-slate-500` | `dark:text-slate-400` |
| `text-slate-400` | `dark:text-slate-500` |
| `hover:bg-slate-50` | `dark:hover:bg-slate-800` |
| `hover:bg-slate-100` | `dark:hover:bg-slate-800` |
| `bg-blue-50 text-blue-600 ring-blue-100` | `dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50` |
| `bg-blue-100 text-blue-600` | `dark:bg-blue-950/60 dark:text-blue-300` |
| `bg-emerald-50 text-emerald-600 ring-emerald-100` | `dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50` |
| `bg-amber-50 text-amber-700` | `dark:bg-amber-950/30 dark:text-amber-300` |
| `bg-rose-50 text-rose-600 ring-rose-100` | `dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50` |
| `bg-violet-50 text-violet-600 ring-violet-100` | `dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/50` |
| `bg-blue-50 border-blue-200/70` (selected) | `dark:bg-blue-950/40 dark:border-blue-800/50` |
| `bg-emerald-50 border-emerald-200/70` (selected) | `dark:bg-emerald-950/40 dark:border-emerald-800/50` |
| `bg-violet-50 ring-violet-200/70` (selected) | `dark:bg-violet-950/40 dark:ring-violet-800/50` |
| `bg-amber-50 border-amber-200/70` (blocker) | `dark:bg-amber-950/30 dark:border-amber-800/50` |
| `divide-slate-100` (between table rows) | (no dark variant needed — the section uses transparent dividers) |
| `border-rose-300` (input error) | `dark:border-rose-800/70` |
| `text-rose-600` (error message) | `dark:text-rose-400` |

**Anti-pattern**: never collapse dark backgrounds to opaque `#000` — let the ambient mesh breathe. The background layer is the global `app/globals.css`; this rule file just governs what classes you reach for on each surface.

---

## 25. i18n / Translation Key Naming

All user-facing strings flow through `useTranslations()`. The organizations page uses two scopes:

| Scope | When |
|---|---|
| `admin.organizationsPage` | Page title, subtitle, stat tile labels, toolbar buttons, search placeholder, table column headers, copy / sync toasts, blocker strings, status text |
| `admin.addOrganizationModal` | Modal title, subtitle, form section headings, field labels & placeholders, role labels, blocker text, footer button labels |

**Key rules**:
- **Flat namespace files**: namespace files live at `lib/i18n/messages/{en,zh-HK}/<ns>.json`. The full key is `admin.organizationsPage.someKey`.
- **Nested scope calls**: a component can declare multiple `useTranslations()` calls. Each scope must contain the keys it reads.
- **No fallback strings**: never write `t("key") || "fallback"`. If the key is missing, add it to both `en/` and `zh-HK/` namespace files first, then use the key directly.
- **zh-HK is Traditional Chinese (繁體中文)**, NOT Simplified. Check existing translations in the file before writing a new one.
- **Add keys via the atomic CLI**:
  ```bash
  npm run i18n:add-keys -- --keys admin.organizationsPage.copyOrgCode --value "Copy org code"
  ```
- **Run the validator** before commit:
  ```bash
  npm run lint:i18n
  ```

---

## 26. Copy-Ready Tailwind Cheat Sheet

Snippets you can paste into a new project. All values are taken verbatim from the page.

### 26.1 Page container

```tsx
<div className="flex flex-col gap-4 p-6 pb-6 h-full min-h-0">
  {/* L1 header, L2 toolbar, L3 card, L4 modals */}
</div>
```

### 26.2 Page-header row

```tsx
<div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2">
  <div className="flex items-center gap-3 min-w-0 flex-1">
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0">
      <Icon icon="solar:buildings-bold" width={20} height={20} />
    </div>
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-[17px] font-bold text-slate-900 leading-tight">Page Title</h1>
        <Pill tone="primary" size="sm">…</Pill>
      </div>
      <p className="text-[12px] text-slate-500 mt-0.5">Page subtitle.</p>
    </div>
  </div>
  <div className="grid grid-cols-3 gap-2 lg:w-[480px]">
    <StatTile label="…" value={30} hint="…" icon="solar:…" tone="primary" />
    <StatTile label="…" value={2}  hint="…" icon="solar:…" tone="violet" />
    <StatTile label="…" value="93%" hint="…" icon="solar:…" tone="success" />
  </div>
</div>
```

### 26.3 Toolbar

```tsx
<div className="flex items-center gap-2 flex-wrap px-5 py-3 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
  <Button variant="warning" size="sm" startIcon={<Icon icon="solar:database-bold" width={12} height={12} />}>Backfill</Button>
  <span className="mx-1 h-5 w-px bg-slate-200" />
  <Button variant="secondary" size="sm" startIcon={<Icon icon="solar:refresh-circle-bold" width={12} height={12} />}>Sync</Button>
  <div className="ml-auto">
    <Button variant="primary" size="sm" startIcon={<Icon icon="solar:add-circle-bold" width={12} height={12} />}>Add</Button>
  </div>
</div>
```

### 26.4 Table card

```tsx
<Card className="flex flex-col flex-1 min-h-0">
  <SectionHeader icon="solar:buildings-bold" title="Subscribers" subtitle="30 records · subscribers" accent="primary"
    actions={<Pill tone="primary" size="sm">30</Pill>} />
  <div className="flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap">
    <FilterTabGroup … />
    <IconButton onClick={refresh} title="Refresh"><Icon icon="solar:refresh-bold" width={14} height={14} /></IconButton>
    <div className="relative ml-auto min-w-[220px]">
      <Icon icon="solar:magnifer-linear" width={11} height={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input type="text" placeholder="Search…"
        className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 cursor-text focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300" />
    </div>
  </div>
  <div className="border-t border-slate-100 flex-1 min-h-0 overflow-auto">
    {/* table */}
  </div>
  <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-500 gap-3 flex-wrap">
    <span>Showing …</span>
    <span className="flex items-center gap-1">
      <Button variant="ghost" size="sm" startIcon={<Icon icon="solar:alt-arrow-left-linear" width={12} height={12} />}>Prev</Button>
      <Button variant="ghost" size="sm" endIcon={<Icon icon="solar:alt-arrow-right-linear" width={12} height={12} />}>Next</Button>
    </span>
  </div>
</Card>
```

### 26.5 Modal shell

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14, ease: EASE }}
      onClick={onClose}>
      <motion.div className="relative w-full max-w-[1400px] mx-4 bg-white rounded-xl border border-slate-200 shadow-xl overflow-visible flex flex-col dark:bg-slate-900 dark:border-slate-800"
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.14, ease: EASE }}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="title-id" aria-busy={isLoading || undefined}>
        <ComponentDebugBadge componentName="MyModal" isSystemAdmin portalToBody />
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 rounded-t-xl bg-white dark:bg-slate-900 dark:border-slate-800/60">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 shrink-0 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/50">
            <Icon icon="solar:buildings-bold" width={18} height={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="title-id" className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Modal title</h2>
            <p className="text-[11px] text-slate-500 truncate dark:text-slate-400">Subtitle</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-slate-100 text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
            <Icon icon="solar:close-circle-bold" width={14} height={14} />
          </button>
        </div>
        {/* Body — 3-column grid or single column */}
        <div className="px-5 py-5">…</div>
        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl dark:bg-slate-900/40 dark:border-slate-800/60">
          <span />
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={onClose} className="…">Cancel</button>
            <button type="button" disabled={isLoading} className="…">Create</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

### 26.6 Role / toggle card

```tsx
<button type="button" onClick={() => toggle(value)} aria-pressed={isSelected}
  className={`relative flex items-start gap-3 p-3 rounded-lg border text-left cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
    isSelected ? "bg-blue-50 ring-blue-200/70 dark:bg-blue-950/40 dark:ring-blue-800/50"
               : "bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
  }`}>
  <div className={`p-1.5 rounded-md shrink-0 ${
    isSelected ? "bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300"
               : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
  }`}>
    <Icon icon="solar:user-circle-bold-duotone" width={14} height={14} />
  </div>
  <div className="flex-1 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">Label</span>
      {isSelected && <Icon icon="solar:check-circle-bold" width={14} height={14} className="text-blue-600 dark:text-blue-400 shrink-0" />}
    </div>
    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug dark:text-slate-400">Description</p>
  </div>
</button>
```

---

## 27. File Map — Where Each Pattern Lives

| Pattern | Source file | Lines (approx) |
|---|---|---|
| Page container, vertical stack | `OrganizationsContent.tsx` | 638 |
| Header row + stat tiles | `OrganizationsContent.tsx` | 640–700 |
| Action toolbar (warning + secondary + primary) | `OrganizationsContent.tsx` | 705–765 |
| Section header | `OrganizationsContent.tsx` | 769–795 |
| Filter bar (FilterTabGroup + search) | `OrganizationsContent.tsx` | 798–850 |
| Skeleton rows | `OrganizationsContent.tsx` | 845–870 |
| Empty state | `OrganizationsContent.tsx` | 871–895 |
| Table thead (sticky, slate-50/95 backdrop-blur) | `OrganizationsContent.tsx` | 905–935 |
| Row stagger animation | `OrganizationsContent.tsx` | 939–955 |
| Organization cell (avatar + name + id) | `OrganizationsContent.tsx` | 957–975 |
| Copyable code cell | `OrganizationsContent.tsx` | 977–990 |
| Action cluster (icon buttons) | `OrganizationsContent.tsx` | 1057–1115 |
| Pagination footer | `OrganizationsContent.tsx` | 1125–1165 |
| Pill, Dot, Button, IconButton, Card, SectionHeader, StatTile primitives | `OrganizationsContent.tsx` | 60–280 |
| FilterTabGroup segmented control | `OrganizationsContent.tsx` | 285–330 |
| Modal shell + backdrop + ComponentDebugBadge | `AddOrganizationModal.tsx` | 685–720 |
| Modal header (icon tile + title + close) | `AddOrganizationModal.tsx` | 720–748 |
| 3-column grid layout (`minmax(0, Nfr)` form) | `AddOrganizationModal.tsx` | 749–775 |
| Sub-card anatomy (pinned header + scroll body) | `AddOrganizationModal.tsx` | 778–800 |
| Segmented toggle (MG mode) | `AddOrganizationModal.tsx` | 195–232 |
| LabeledInput | `AddOrganizationModal.tsx` | 235–275 |
| Mirror preview block | `AddOrganizationModal.tsx` | 871–924 |
| MgResultRow | `AddOrganizationModal.tsx` | 1396–1465 |
| SelectedMgCard | `AddOrganizationModal.tsx` | 1474–1520 |
| VendorTypeMultiSelect (portaled) | `AddOrganizationModal.tsx` | 1525–1775 |
| AddUserPanel (right column) | `AddOrganizationModal.tsx` | 1800–2170 |
| UserField | `AddOrganizationModal.tsx` | 2180–2245 |
| UserPasswordToggle (eye toggle) | `AddOrganizationModal.tsx` | 2250–2285 |
| UserMiniSelect (portaled) | `AddOrganizationModal.tsx` | 2290–2425 |
| Modal footer (Cancel + Primary) | `AddOrganizationModal.tsx` | 1346–1390 |
| Inline blocker (amber callout) | `AddOrganizationModal.tsx` | 2155–2165 |
| `formatSystemAdminDate` (YYYY/MM/DD) | `lib/dates/formatSystemAdminDate.ts` | (external) |
| `animation`, `EASE` tokens | `lib/design-system/cheatsheet.ts` | (external) |
| `AsyncIcon` | `components/ui/shared/AsyncIcon.tsx` | (external) |
| `ComponentDebugBadge` | `components/ui/shared/ComponentDebugBadge.tsx` | (external) |
| `customToast` | `components/ui/toast/CustomToast.ts` | (external) |

---

## 28. Build-Your-Own-Page Checklist

When you start a new page on the same visual language, verify these in order:

### Foundation (do first)

- [ ] Page is a Server Component wrapper with a `"use client"` child that owns all state.
- [ ] Page wrapper has a `<Suspense fallback={null}>` so URL search params don't crash during prerender.
- [ ] All imports use **`AsyncIcon as Icon`** — no `@iconify/react` direct imports.
- [ ] All user-facing strings use `useTranslations()` — no hardcoded English in JSX.

### Layout

- [ ] Page container is `flex flex-col gap-4 p-6 pb-6 h-full min-h-0`.
- [ ] Header row uses `flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 pb-2`.
- [ ] Page icon is a **filled** `bg-{tone}-600 text-white` 40×40 tile.
- [ ] Title is `text-[17px] font-bold`, subtitle is `text-[12px] text-slate-500`.
- [ ] Stat tiles are `grid-cols-3 gap-2 lg:w-[480px]`.
- [ ] Action toolbar is a separate `rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]` card.
- [ ] Vertical separator in toolbar is `mx-1 h-5 w-px bg-slate-200`.
- [ ] Primary CTA sits in a `ml-auto` wrapper.

### Table card

- [ ] Card is `rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col flex-1 min-h-0`.
- [ ] SectionHeader uses one of the 6 accent tones (primary, violet, warning, success, danger, neutral).
- [ ] Thead is sticky with `bg-slate-50/95 backdrop-blur-sm`.
- [ ] Per-tab accent carries into SectionHeader and the count pill in `actions`.
- [ ] Filter bar uses `FilterTabGroup` for the tabs and a search input with `left-2.5` magnifier icon.
- [ ] AnimatePresence wraps three keyed branches: `loading` (skeleton) / `empty` (centered icon + message) / `rows` (table).
- [ ] Each row has `opacity-70 group-hover:opacity-100` action cluster with right-aligned icon buttons.
- [ ] Pagination footer uses `shrink-0 … bg-slate-50/40` and shows "Showing X - Y of Z · Page A of B".

### Modal (if any)

- [ ] Modal is hand-coded `motion.div` with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-busy`.
- [ ] Shell is `overflow-visible` so portaled dropdowns can bleed past the edge.
- [ ] Inner sub-cards are `overflow-hidden` so the colored background clips to the rounded corners.
- [ ] `ComponentDebugBadge` is the **first child** with `portalToBody`.
- [ ] Header icon tile is **translucent tinted** (NOT filled like the page header).
- [ ] Header has its own `rounded-t-xl`, footer has its own `rounded-b-xl`.
- [ ] Click on backdrop closes; click on modal body does not.

### Form fields (if any)

- [ ] Each field's label uses one of two styles:
  - `text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500` (LabeledInput — for grid-laid-out forms)
  - `text-[11px] font-medium text-slate-700` (UserField — for compact right-column forms)
- [ ] Required marker is a `text-rose-500 *` after the label.
- [ ] Each input has the universal focus ring: `focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`.
- [ ] Errors are inline below the field (`text-[10.5px] text-rose-600`) and the input border turns `border-rose-300`.
- [ ] Hints are inline below the field (`text-[10.5px] text-slate-500`).

### Dropdowns (if any)

- [ ] Custom dropdowns are **portaled to `document.body`** with `position: fixed`.
- [ ] Trigger position is tracked via `getBoundingClientRect()` and updated on scroll (capture phase) + resize while open.
- [ ] Click-outside checks **both** the trigger ref and the panel ref.
- [ ] Escape closes the dropdown.
- [ ] Panel `z-index` is above the modal shell (60 > 50).
- [ ] Panel is `overflow-hidden` so selected-option backgrounds clip to the rounded corners.

### Dark mode

- [ ] Every `bg-white`, `bg-slate-*`, `border-slate-*`, `text-slate-*`, `ring-*` class has a `dark:` counterpart.
- [ ] Tinted icon tiles use the deeper-glow pattern: `dark:bg-{tone}-950/40 dark:text-{tone}-300 dark:ring-{tone}-800/50`.
- [ ] Selected-card backgrounds use the deep glow: `dark:bg-{tone}-950/40 dark:border-{tone}-800/50`.
- [ ] Form inputs are `dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200`.
- [ ] You have actually **opened the page in dark mode** and visually confirmed no white slabs or light-yellow icon tiles.

### Animation

- [ ] All animations use the universal snappy ease: `[0.25, 0.1, 0.25, 1]` (imported as `EASE` from `lib/design-system/cheatsheet`).
- [ ] Page fade is `0.2`, tab swap is `0.22`, modal is `0.14`, pill spring is `420/34/0.6`.
- [ ] Row stagger is `delay: Math.min(rowIndex * 0.025, 0.2)`.
- [ ] Rows animate **opacity only** (no `y` or `x`) so they don't shift the table layout.
- [ ] Modal and dropdown panels DO use directional motion (`y: 6` or `y: -4`).

### i18n

- [ ] All keys are declared in BOTH `en/<namespace>.json` AND `zh-HK/<namespace>.json`.
- [ ] `npm run i18n:sync` has been run after every namespace edit.
- [ ] `npm run lint:i18n` passes with zero missing keys.
- [ ] No `t("key") || "fallback"` patterns anywhere.
- [ ] zh-HK values are **Traditional Chinese** (繁體中文), not Simplified.
