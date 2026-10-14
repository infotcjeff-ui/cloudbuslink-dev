# OneFleet System Admin — Vehicles UI Documentation

> **Captured**: 14 October 2026 (UTC+8)
> **URL**: `http://localhost:3000/onefleet-system-admin/vehicles`
> **Source**: `app/onefleet-system-admin/(dashboard)/vehicles/` + `components/ui/fleet/wizard/`
> **Scope**: Vehicles list page (tabs, filters, table columns, side panels), Add Vehicle Wizard (4 steps), Bulk Add Vehicles Modal
> **Style**: Follows `docs/ui-documentation-2026-10-13/onefleet-system-admin-ui.md` + `organizations-page-style-reference.md`

---

## Table of Contents

1. [Vehicles List Page — Overview](#1-vehicles-list-page--overview)
2. [Vehicles List Page — Header Stats](#2-vehicles-list-page--header-stats)
3. [Vehicles List Page — Filters & Controls](#3-vehicles-list-page--filters--controls)
4. [Vehicles List Page — Physical Vehicles Table](#4-vehicles-list-page--physical-vehicles-table)
5. [Vehicles List Page — Virtual Vehicles Table](#5-vehicles-list-page--virtual-vehicles-table)
6. [Vehicles List Page — Side Panels](#6-vehicles-list-page--side-panels)
7. [Vehicles List Page — Design Tokens](#7-vehicles-list-page--design-tokens)
8. [Add Vehicle Wizard — Overview](#8-add-vehicle-wizard--overview)
9. [Add Vehicle Wizard — Step 0: Select Owner](#9-add-vehicle-wizard--step-0-select-owner)
10. [Add Vehicle Wizard — Step 1: Vehicle Details](#10-add-vehicle-wizard--step-1-vehicle-details)
11. [Add Vehicle Wizard — Step 2: Media & Documents](#11-add-vehicle-wizard--step-2-media--documents)
12. [Add Vehicle Wizard — Step 3: Insurance & Remarks](#12-add-vehicle-wizard--step-3-insurance--remarks)
13. [Add Vehicle Wizard — Design Tokens](#13-add-vehicle-wizard--design-tokens)
14. [Bulk Add Vehicles Modal](#14-bulk-add-vehicles-modal)
15. [Vehicle Action Modals](#15-vehicle-action-modals)

---

## 1. Vehicles List Page — Overview

**URL**: `http://localhost:3000/onefleet-system-admin/vehicles`
**Source**: `app/onefleet-system-admin/(dashboard)/vehicles/VehiclesContent.tsx`

### Page Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Page Header (H1 + subtitle)                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  Header Stats Row (3 StatTiles)                                             │
├──────────────────────────────────────────────────────────────┬──────────────┤
│  Filter Bar (Pairing | Contract | Org Select | Search)        │              │
├──────────────────────────────────────────────────────────────┤  Side Panel  │
│  Table Card (Physical / Virtual tabs via dropdown)            │  Status      │
│  ┌─────────────────────────────────────────────────────────┐  │  Breakdown   │
│  │ Table Header (columns)                                   │  │  +           │
│  │ ─────────────────────────────────────────────────────── │  │  Recently    │
│  │ Table Rows (vehicle data)                               │  │  Joined      │
│  │ ...                                                      │  │              │
│  └─────────────────────────────────────────────────────────┘  │              │
├──────────────────────────────────────────────────────────────┴──────────────┤
│  Sticky Pagination Footer                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Color Palette (System Admin)

| Token | Value | Usage |
|---|---|---|
| **Chrome / Neutral** | `slate-50` `slate-100` `slate-200` `slate-300` `slate-400` `slate-500` `slate-600` `slate-700` `slate-800` `slate-900` `slate-950` | Borders, dividers, body text, muted labels, page chrome |
| **Primary Action** | `blue-50` `blue-100` `blue-200/70` `blue-400` `blue-500` `blue-600` `blue-700` | Primary buttons, active filter pills, primary badges, primary icons |
| **Virtual / Secondary** | `violet-50` `violet-100` `violet-200/70` `violet-500` `violet-600` `violet-700` | Virtual vehicles, secondary features, "central" backup category |
| **Success** | `emerald-50` `emerald-100` `emerald-200/70` `emerald-500` `emerald-600` `emerald-700` | Successful states, active vehicles |
| **Danger** | `rose-50` `rose-100` `rose-200/70` `rose-500` `rose-600` `rose-700` | Destructive buttons, deleted vehicles, errors |
| **Warning** | `amber-50` `amber-100` `amber-200/70` `amber-500` `amber-600` `amber-700` `amber-800` `amber-900` | Warning states, pending vehicles |
| **Info** | `sky-50` `sky-100` `sky-200/70` `sky-500` `sky-600` `sky-700` | Info states, Wasabi storage pill |

### Typography Scale

| Role | Tailwind Class | Example |
|---|---|---|
| Page Title (H1) | `text-[17px] font-bold text-slate-900 leading-tight` | "Vehicles" |
| Page Subtitle | `text-[12px] text-slate-500 mt-0.5` | "Manage vehicles linked to management groups." |
| Section Title | `text-[14px] font-semibold text-slate-900 leading-tight` | Table headers, card titles |
| Body / Table Cell | `text-[12px] font-medium text-slate-700` | Default readable text |
| Small / Helper | `text-[11px] text-slate-500` | Table headers, timestamps |
| Label Uppercase | `text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500` | KPI tile labels, StatTile labels |
| Micro Label | `text-[9px] uppercase tracking-wider text-slate-500 font-semibold` | Tiny stat tile labels |

### Spacing & Layout

| Pattern | Tailwind Class |
|---|---|
| Page container | `p-6 pb-6` |
| Card header | `px-5 pt-5 pb-3` |
| Card body | `px-5 py-4` or `px-5 pb-5` |
| Card footer | `px-5 py-2.5` |
| Filter bar | `flex items-center gap-2 px-5 pb-3 pt-1 flex-wrap` |
| Table cell (full) | `px-5 py-2.5` |
| Table cell (middle) | `px-3 py-2.5` |

### Animation Tokens

| Surface | Duration | Easing |
|---|---|---|
| Page fade | `0.2` | `[0.25, 0.1, 0.25, 1]` |
| Tab/filter swap | `0.22` | `[0.25, 0.1, 0.25, 1]` |
| Filter pill spring | `spring: 420/34/0.6` | (spring) |
| Modal entrance/exit | `0.14`, `y: 6` | `[0.25, 0.1, 0.25, 1]` |
| Row stagger | `delay: rowIndex * 0.025` (cap `0.2`) | `[0.25, 0.1, 0.25, 1]` |

---

## 2. Vehicles List Page — Header Stats

**Source**: `VehiclesContent.tsx` lines ~380-450 (`StatTile` component)

### 3 StatTiles Row

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Physical    │  │ Virtual     │  │ Deleted     │
│ 48          │  │ 6           │  │ 6           │
│ vehicles    │  │ vehicles    │  │ vehicles    │
└─────────────┘  └─────────────┘  └─────────────┘
```

### StatTile Variants

| Variant | Use Case | Tone | Icon |
|---|---|---|---|
| Physical | Active real vehicles | `primary` (`text-blue-700`) | `solar:car-bold` |
| Virtual | Placeholder vehicles | `violet` (`text-violet-700`) | `solar:ghost-bold` |
| Deleted | Soft-deleted vehicles | `neutral` (`text-slate-700`) | `solar:trash-bin-trash-bold` |

### StatTile Anatomy

```tsx
<div className="flex flex-col gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
  <div className="flex items-center justify-between">
    <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-500">
      {label}  // "Physical", "Virtual", "Deleted"
    </span>
    <Icon icon={icon} width={12} height={12} className="text-slate-400" />
  </div>
  <span className="text-lg font-semibold tabular-nums leading-none text-blue-700">
    {value}  // "48", "6", "6"
  </span>
</div>
```

### Clickable StatTile (Filter Trigger)

When a StatTile is clickable, it applies active state styling:

```tsx
// Active state (clicked)
className="border-blue-300 bg-blue-50/60 ring-1 ring-blue-200/60"

// Inactive state
className="border-slate-200/80 bg-slate-50/60"
```

---

## 3. Vehicles List Page — Filters & Controls

### Filter Bar Anatomy

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  Pairing Filter   │  Contract Filter   │  Organization Select   │  Search Input        │
│  [All ▾]         │  [All ▾]           │  [All Organizations ▾] │  [🔍 Search...]      │
│  Physical [●]     │                    │                        │                      │
│  Virtual          │                    │                        │   [+ Add Vehicle]    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Filter Components

#### 1. Pairing Filter (FilterTabGroup)

**Source**: `FilterTabGroup` primitive with `layoutId="vehicles-tab-pill"`

| Option | Label | Key | Color |
|---|---|---|---|
| All | All | `all` | default |
| Paired | Paired | `paired` | default |
| Unpaired | Unpaired | `unpaired` | default |
| Physical | Physical | `physical` | `primary` (blue) |
| Virtual | Virtual | `virtual` | `violet` |

**Active pill style**:
```tsx
<motion.span
  layoutId="vehicles-tab-pill"
  className="absolute inset-0 rounded-[5px] bg-blue-600 shadow-[0_1px_2px_rgba(37,99,235,0.35)]"
  transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.6 }}
/>
```

**Inactive pill style**:
```tsx
<button className="relative z-10 h-7 rounded-[5px] px-3 text-[12px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
```

#### 2. Contract Filter (Custom Dropdown)

| Element | Class |
|---|---|
| Trigger button | `h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700` |
| Popover panel | `rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden` |
| Search input | `h-8 w-full bg-transparent pl-7 pr-2.5 text-[12px] font-medium text-slate-700` |

#### 3. Organization Select (Searchable Combobox)

| Element | Class |
|---|---|
| Trigger button | `h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700` |
| Panel | `rounded-xl border border-slate-200 bg-white shadow-xl` |
| Section header | `text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500 bg-slate-50/95` |

#### 4. Search Input

```tsx
<div className="relative min-w-[180px]">
  <Icon icon="solar:filter-bold" width={11} height={11}
    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
  <input
    type="text"
    placeholder={t("filters.searchPlaceholder")}
    className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2.5
               text-[12px] text-slate-700 placeholder:text-slate-400
               focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
  />
</div>
```

#### 5. Physical/Virtual Dropdown Selector

**Placement**: Top-right of the table card header
**Style**: Custom dropdown with `Physical` (blue tone) and `Virtual` (violet tone) options

```tsx
// Dropdown trigger
<button className="inline-flex items-center gap-2 h-8 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
  <Dot tone={isPhysical ? "primary" : "violet"} />
  {isPhysical ? "Physical" : "Virtual"}
  <Icon icon="solar:alt-arrow-down-bold" width={9} height={9} className="text-slate-400" />
</button>
```

---

## 4. Vehicles List Page — Physical Vehicles Table

**Source**: `VehiclesContent.tsx` ~lines 600-1200

### Table Columns

| Column | Key | Width | Align | Notes |
|---|---|---|---|---|
| Reg. Mark | `registrationMark` | 140px | left | Primary identifier, bold text |
| Make / Model | `makeModel` | 160px | left | Combined "Make Model" |
| Organization | `organization` | 160px | left | Tenant name |
| Contract | `contract` | 140px | left | Contract number |
| Pairing | `pairing` | 100px | center | Device ID or "Unpaired" |
| Status | `status` | 100px | center | Active/Upcoming/Expired |
| Actions | `actions` | auto | right | Icon buttons |

### Column Details

#### 1. Reg. Mark Column
```tsx
<td className="px-5 py-2.5">
  <div className="flex flex-col gap-0.5">
    <span className="text-[12px] font-semibold text-slate-900">
      {vehicle.registrationMark}
    </span>
    {vehicle.vehicleClass && (
      <span className="text-[10px] text-slate-500">
        {vehicle.vehicleClass}
      </span>
    )}
  </div>
</td>
```

#### 2. Make / Model Column
```tsx
<td className="px-3 py-2.5">
  <div className="flex flex-col gap-0.5">
    <span className="text-[12px] font-medium text-slate-700">
      {vehicle.make} {vehicle.model}
    </span>
  </div>
</td>
```

#### 3. Organization Column
```tsx
<td className="px-3 py-2.5">
  <div className="flex flex-col gap-0.5">
    <span className="text-[12px] font-medium text-slate-700">
      {vehicle.organizationName}
    </span>
    {vehicle.managementGroupName && (
      <span className="text-[10px] text-slate-500">
        {vehicle.managementGroupName}
      </span>
    )}
  </div>
</td>
```

#### 4. Contract Column
```tsx
<td className="px-3 py-2.5">
  <span className="text-[12px] font-medium text-slate-700">
    {vehicle.contractNumber}
  </span>
</td>
```

#### 5. Pairing Column
```tsx
<td className="px-3 py-2.5 text-center">
  {vehicle.deviceId ? (
    <HoverPopover content="Device ID (pairing with legacy system)">
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200/70">
        <Icon icon="solar:wireless-charging-bold" width={9} height={9} />
        {vehicle.deviceId}
      </span>
    </HoverPopover>
  ) : (
    <span className="text-[11px] text-slate-400">Unpaired</span>
  )}
</td>
```

**Pairing Badge Variants**:
| State | Pill Style |
|---|---|
| Paired | `bg-blue-50 text-blue-700 ring-blue-200/70` |
| Unpaired | plain `text-slate-400` |

#### 6. Status Column

**Source**: `getStatusVariant()` function

| Status | Tone | Badge Style |
|---|---|---|
| Active | `success` | `bg-emerald-50 text-emerald-700 ring-emerald-200/70` |
| Upcoming | `warning` | `bg-amber-50 text-amber-700 ring-amber-200/70` |
| Expired | `danger` | `bg-rose-50 text-rose-700 ring-rose-200/70` |
| Pending | `neutral` | `bg-slate-100 text-slate-600 ring-slate-200` |

**Status Badge Anatomy**:
```tsx
<span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset ${
  tone === "success" ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70" :
  tone === "warning" ? "bg-amber-50 text-amber-700 ring-amber-200/70" :
  tone === "danger" ? "bg-rose-50 text-rose-700 ring-rose-200/70" :
  "bg-slate-100 text-slate-600 ring-slate-200"
}`}>
  <span className={`h-1.5 w-1.5 rounded-full ${
    tone === "success" ? "bg-emerald-500" :
    tone === "warning" ? "bg-amber-500" :
    tone === "danger" ? "bg-rose-500" :
    "bg-slate-400"
  }`} />
  {status}
</span>
```

#### 7. Actions Column

**Icon Buttons** (right-aligned cluster):

| Action | Icon | Tooltip | Variant |
|---|---|---|---|
| View | `solar:eye-bold` | "View details" | `ghost` |
| Pair | `solar:link-bold` | "Pair device" | `ghost` |
| Unpair | `solar:unlink-bold` | "Unpair device" | `ghost` |
| Edit | `solar:pen-bold` | "Edit vehicle" | `ghost` |
| Promote | `solar:rocket-launch-bold` | "Promote to physical" | `primary` |
| Delete | `solar:trash-bin-trash-bold` | "Delete vehicle" | `danger` |

**Action Button Anatomy**:
```tsx
<IconButton
  onClick={handleAction}
  title={t("actions.view")}
  variant="ghost"
>
  <Icon icon="solar:eye-bold" width={14} height={14} />
</IconButton>

// IconButton variants
const variants = {
  ghost: "hover:bg-slate-100 text-slate-500 hover:text-slate-700",
  primary: "hover:bg-blue-50 text-slate-400 hover:text-blue-600",
  danger: "hover:bg-rose-50 text-slate-400 hover:text-rose-600",
  subtle: "bg-slate-100 hover:bg-slate-200 text-slate-600",
};
```

### Table Row Hover State
```tsx
<motion.tr
  className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
  // Entrance animation
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.22, ease: ANIMATION_EASE, delay: rowIndex * 0.025 }}
>
```

### Table Header Style
```tsx
<thead>
  <tr className="border-b border-slate-200 bg-slate-50/60">
    {columns.map((col) => (
      <th
        key={col.key}
        className={`px-5 py-2.5 text-left text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500 ${
          col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""
        }`}
      >
        {col.label}
      </th>
    ))}
  </tr>
</thead>
```

---

## 5. Vehicles List Page — Virtual Vehicles Table

**Source**: `VehiclesContent.tsx` ~lines 1200-1600

### Virtual vs Physical Table Differences

| Aspect | Physical | Virtual |
|---|---|---|
| Color accent | `blue-600` | `violet-600` |
| Status dot | `primary` (blue) | `violet` |
| Promote action | ✅ Visible | ❌ Hidden |
| Default actions | View, Pair, Unpair, Edit, Delete | View, Edit, Delete |

### Virtual Vehicle Row Styling
```tsx
// Virtual vehicle has violet accent on hover
<tr className="hover:bg-violet-50/30 transition-colors cursor-pointer group">
```

### Promote to Physical Action

| Field | Value |
|---|---|
| Icon | `solar:rocket-launch-bold` |
| Tooltip | "Promote to physical" |
| Variant | `primary` (blue hover) |
| Confirmation | Modal with warning text |

---

## 6. Vehicles List Page — Side Panels

### Panel 1: Status Breakdown Card

**Placement**: Right side of page, below "Recently Joined" card

```tsx
<Card>
  <SectionHeader
    icon="solar:pie-chart-2-bold"
    title={t("sideCards.statusBreakdown.title")}
    subtitle={t("sideCards.statusBreakdown.subtitle")}
    accent="primary"
  />
  <div className="px-5 py-4 space-y-3">
    {/* Status items */}
  </div>
</Card>
```

#### Status Breakdown Items

| Status | Count | Color | Class |
|---|---|---|---|
| Active | `activeCount` | `emerald` | `bg-emerald-500` |
| Upcoming | `upcomingCount` | `amber` | `bg-amber-500` |
| Expired | `expiredCount` | `rose` | `bg-rose-500` |

#### Status Item Anatomy

```tsx
<div className="flex items-center justify-between gap-3">
  <div className="flex items-center gap-2">
    <div className={`h-2 w-2 rounded-full ${statusColor}`} />
    <span className="text-[12px] font-medium text-slate-700">{label}</span>
  </div>
  <div className="flex items-center gap-3">
    <span className="text-[12px] font-semibold text-slate-900">{count}</span>
    {/* Progress bar */}
    <div className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full ${toneBg[tone]} transition-all duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  </div>
</div>
```

### Panel 2: Recently Joined Card

**Placement**: Right side of page, below Status Breakdown

```tsx
<Card>
  <SectionHeader
    icon="solar:clock-circle-bold"
    title={t("sideCards.recentlyJoined.title")}
    subtitle={t("sideCards.recentlyJoined.subtitle")}
    accent="neutral"
  />
  <div className="px-5 py-4 space-y-3">
    {/* Recent vehicle items */}
  </div>
</Card>
```

#### Recent Vehicle Item Anatomy

```tsx
<div className="flex items-center justify-between gap-3">
  <div className="flex items-center gap-2 min-w-0">
    {/* Vehicle icon */}
    <Icon icon={isVirtual ? "solar:ghost-bold" : "solar:car-bold"} width={14} height={14}
      className={isVirtual ? "text-violet-500 shrink-0" : "text-blue-500 shrink-0"} />
    {/* Vehicle info */}
    <div className="min-w-0 flex flex-col">
      <span className="text-[12px] font-medium text-slate-900 truncate">
        {vehicle.registrationMark}
      </span>
      <span className="text-[10px] text-slate-500 truncate">
        {vehicle.make} {vehicle.model}
      </span>
    </div>
  </div>
  {/* Time ago */}
  <span className="text-[10px] text-slate-400 shrink-0">
    {relativeTime}
  </span>
</div>
```

### Empty State (No Recent Vehicles)
```tsx
<div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
  <Icon icon="solar:car-bold" width={24} height={24} className="text-slate-300" />
  <span className="text-[11px] text-slate-500">No recent activity</span>
</div>
```

---

## 7. Vehicles List Page — Design Tokens Summary

### Component Classes Reference

| Component | Tailwind Classes |
|---|---|
| **Page container** | `p-6 pb-6 h-full min-h-0` |
| **Card** | `rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]` |
| **Section header icon box** | `flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset` |
| **StatTile** | `rounded-lg border border-slate-200/80 bg-slate-50/60 px-3.5 py-3` |
| **FilterTabGroup trigger** | `h-7 rounded-[5px] px-3 text-[12px] font-medium` |
| **Active pill** | `bg-blue-600 shadow-[0_1px_2px_rgba(37,99,235,0.35)]` |
| **Status badge (Active)** | `bg-emerald-50 text-emerald-700 ring-emerald-200/70` |
| **Status badge (Upcoming)** | `bg-amber-50 text-amber-700 ring-amber-200/70` |
| **Status badge (Expired)** | `bg-rose-50 text-rose-700 ring-rose-200/70` |
| **Pairing badge** | `bg-blue-50 text-blue-700 ring-blue-200/70` |
| **IconButton (ghost)** | `h-7 w-7 rounded-md hover:bg-slate-100` |
| **IconButton (danger)** | `h-7 w-7 rounded-md hover:bg-rose-50` |
| **Table row hover** | `hover:bg-slate-50/50 cursor-pointer` |
| **Search input** | `h-8 rounded-md border border-slate-200 bg-white pl-7` |

### Border Radius Reference

| Element | Tailwind Class |
|---|---|
| Buttons / Inputs / Pills | `rounded-md` (6px) |
| Small cards / KPI tiles | `rounded-lg` (8px) |
| Cards / Modals | `rounded-xl` (12px) |
| Filter pill indicator | `rounded-[5px]` (5px) |
| Avatars / Dots | `rounded-full` |

### Shadow Reference

| Element | Tailwind Class |
|---|---|
| Cards | `shadow-[0_1px_2px_rgba(15,23,42,0.04)]` |
| Buttons | `shadow-sm` |
| Active filter pill | `shadow-[0_1px_2px_rgba(37,99,235,0.35)]` |
| Modals | `shadow-xl` |
| Dropdown panels | `shadow-xl` |

---

## 8. Add Vehicle Wizard — Overview

**URL**: `http://localhost:3000/onefleet-system-admin/vehicles/add`
**Source**: `components/ui/fleet/wizard/AddVehicleWizard.tsx` + `WizardLayout.tsx`

### Wizard Navigation Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Vehicles    │  Add Vehicle    │            Step 1 of 4          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ●─●─●─○  Owner → Details → Media → Insurance                              │
├───────────────────────────────────────────┬─────────────────────────────────┤
│                                           │                                 │
│  Step Content Area                        │  Summary Card (right sidebar)    │
│  (varies by step)                         │  - Selected owner                │
│                                           │  - Vehicle summary               │
│                                           │  - Attachments count            │
│                                           │                                 │
├───────────────────────────────────────────┴─────────────────────────────────┤
│  [Cancel]                                        [Save Draft] [Continue →]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Wizard Steps

| Step | Index | Name | Component |
|---|---|---|---|
| 0 | Owner Selection | "Select Owner" | `AddNewVehicleStep.tsx` |
| 1 | Vehicle Details | "Vehicle Details" | `VehicleRegistrationForm.tsx` |
| 2 | Media | "Media & Documents" | `MediaUploadForm.tsx` |
| 3 | Insurance | "Insurance & Remarks" | `InsuranceAndRemarksStep.tsx` |

### Progress Indicator Anatomy

```tsx
<div className="flex items-center gap-2 px-5 py-4">
  {steps.map((step, idx) => (
    <React.Fragment key={idx}>
      {/* Step circle */}
      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${
        idx < currentStep
          ? "bg-blue-600 text-white"  // completed
          : idx === currentStep
          ? "bg-blue-600 text-white"  // current
          : "bg-slate-100 text-slate-500"  // upcoming
      }`}>
        {idx < currentStep ? (
          <Icon icon="solar:check-bold" width={12} height={12} />
        ) : (
          idx + 1
        )}
      </div>
      {/* Connector line */}
      {idx < steps.length - 1 && (
        <div className={`flex-1 h-0.5 rounded ${
          idx < currentStep ? "bg-blue-600" : "bg-slate-200"
        }`} />
      )}
    </React.Fragment>
  ))}
</div>
```

### Footer Actions

| Button | Variant | Icon | Action |
|---|---|---|---|
| Cancel | `ghost` | — | Close wizard, discard |
| Save Draft | `secondary` | `solar:floppy-disk-bold` | Save vehicle as draft |
| Continue | `primary` | `solar:arrow-right-bold` | Next step |

---

## 9. Add Vehicle Wizard — Step 0: Select Owner

**Source**: `components/ui/fleet/wizard/steps/AddNewVehicleStep.tsx`

### Step 0 Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Who owns this vehicle?                                                     │
│  Assign the vehicle to an organization or individual.                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  [●] Organization (B2B fleet)                                        │  │
│  │      Assign to an organization with a management group               │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  [ ] Individual (Personal fleet)                                     │  │
│  │      Assign to an individual subscriber                             │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Management Group ▾]                    [Search organization...]          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Owner Details (appears after selection)                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Organization Name: [Auto-filled]                                   │  │
│  │  Owner: [Auto-filled or searchable]                                  │  │
│  │  Email: [Auto-filled or ---]                                         │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Owner Type Selector (Radio Cards)

```tsx
// Organization option (selected)
<div className="rounded-xl border-2 border-blue-600 bg-blue-50/40 p-4">
  <div className="flex items-start gap-3">
    <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-600 bg-blue-600">
      <div className="h-2 w-2 rounded-full bg-white" />
    </div>
    <div>
      <p className="text-[14px] font-semibold text-slate-900">Organization (B2B fleet)</p>
      <p className="text-[12px] text-slate-500">Assign to an organization with a management group</p>
    </div>
  </div>
</div>

// Individual option (unselected)
<div className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300">
  <div className="flex items-start gap-3">
    <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300">
      {/* empty center */}
    </div>
    <div>
      <p className="text-[14px] font-medium text-slate-700">Individual (Personal fleet)</p>
      <p className="text-[12px] text-slate-500">Assign to an individual subscriber</p>
    </div>
  </div>
</div>
```

### Management Group Combobox

**Source**: Custom `SearchableSelect` component

```tsx
// Trigger
<div className="relative">
  <button className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-left
                     text-[12px] font-medium text-slate-700
                     hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
    {selectedMG ? selectedMG.name : "Select management group..."}
    <Icon icon="solar:alt-arrow-down-bold" className="absolute right-3 top-1/2 -translate-y-1/2" />
  </button>
</div>
```

### User Search (for Individual mode)

```tsx
// Searchable user dropdown
<div className="relative min-w-[240px]">
  <Icon icon="solar:magnifer-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
  <input
    type="text"
    placeholder="Search by name or email..."
    className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3
               text-[12px] font-medium text-slate-700
               focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
  />
</div>
```

### Owner Details Preview

```tsx
<div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-2">
  <div className="flex items-center gap-2">
    <Icon icon="solar:buildings-bold" width={14} height={14} className="text-slate-400" />
    <span className="text-[11px] font-medium text-slate-500">Organization Name</span>
    <span className="text-[12px] font-semibold text-slate-900 ml-auto">{orgName}</span>
  </div>
  <div className="flex items-center gap-2">
    <Icon icon="solar:user-bold" width={14} height={14} className="text-slate-400" />
    <span className="text-[11px] font-medium text-slate-500">Owner</span>
    <span className="text-[12px] font-semibold text-slate-900 ml-auto">{ownerName}</span>
  </div>
  <div className="flex items-center gap-2">
    <Icon icon="solar:mailbox-bold" width={14} height={14} className="text-slate-400" />
    <span className="text-[11px] font-medium text-slate-500">Email</span>
    <span className="text-[12px] font-semibold text-slate-900 ml-auto">{email || "---"}</span>
  </div>
</div>
```

---

## 10. Add Vehicle Wizard — Step 1: Vehicle Details

**Source**: `components/ui/fleet/wizard/steps/VehicleRegistrationForm.tsx`

### Step 1 Layout (12-Column Grid)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  GPS Settings (Admin)                                        │  Core Identity                 │
│  ┌──────────────────────────────────────────────────────┐  │  ┌────────────────────────────┐ │
│  │  GPS Device ID:     [________________________]       │  │  │  Vehicle Class:  [▾]     │ │
│  │  GPS Plate Number:   [________________________]       │  │  │  Make:           [▾]     │ │
│  └──────────────────────────────────────────────────────┘  │  │  │  Model:          [___]   │ │
│                                                          │  │  └────────────────────────────┘ │
├───────────────────────────────────────────────────────────┼─────────────────────────────────────┤
│  Physical Identity                                                         │  Technical Identifiers     │
│  ┌──────────────────────────────────────────────────────┐                │  ┌────────────────────────┐ │
│  │  Registration Mark: [________________________]       │                │  │  VIN:       [______]  │ │
│  │  Registration Date: [____/____/________]            │                │  │  TPL Code:  [______]  │ │
│  │  Country of Registration: [__________________]       │                │  └────────────────────────┘ │
│  └──────────────────────────────────────────────────────┘                │                              │
├───────────────────────────────────────────────────────────┼─────────────────────────────────────┤
│  Dimensions & Weights                                                    │  Ownership History           │
│  ┌──────────────────────────────────────────────────────┐                │  ┌────────────────────────┐ │
│  │  Length: [____]m  Width: [____]m  Height: [____]m │                │  │  First Owner: [___]   │ │
│  │  Max Laden Weight: [____________] kg                │                │  │  Current Owner: [__]   │ │
│  │  Unladen Weight: [____________] kg                  │                │  │  No. of Owners: [__]   │ │
│  └──────────────────────────────────────────────────────┘                │  └────────────────────────┘ │
├───────────────────────────────────────────────────────────┼─────────────────────────────────────┤
│  Capacity                                                                 │  Tax & Financials           │
│  ┌──────────────────────────────────────────────────────┐                │  ┌────────────────────────┐ │
│  │  Seats: [__]  Standees: [__]  Sleeping Berths: [__]│                │  │  Annual Tax: [______]  │ │
│  │  Axles: [__]  Wheelbase: [____] cm                │                │  │  Tax Expiry: [________]│ │
│  └──────────────────────────────────────────────────────┘                │  └────────────────────────┘ │
├───────────────────────────────────────────────────────────┼─────────────────────────────────────┤
│  Licence Conditions                                                                  │          │
│  ┌──────────────────────────────────────────────────────────────────────┐ │          │
│  │  Licence No.: [____________________]  Issue Date: [____/____/____] │ │          │
│  │  Expiry Date: [____/____/____]  Conditions: [____________________] │ │          │
│  └──────────────────────────────────────────────────────────────────────┘ │          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Field Types Reference

| Field Type | Component | Class |
|---|---|---|
| Text input | `<input>` | `h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700` |
| Number input | `<input type="number">` | Same as text + `tabular-nums` |
| Date input | `<DatePicker>` (HeroUI) | `h-9 rounded-md border border-slate-200` |
| Dropdown | Custom `SearchableSelect` | `h-9 rounded-lg border border-slate-200` |
| Textarea | `<textarea>` | Same as text + `resize-none` |

### Section Header Pattern

```tsx
<div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
  <Icon icon="solar:map-point-bold" width={16} height={16} className="text-blue-600" />
  <h3 className="text-[14px] font-semibold text-slate-900">GPS Settings (Admin)</h3>
</div>
```

### SearchableSelect Component (Vehicle Make/Class)

```tsx
// Trigger button
<button
  className="h-9 w-full inline-flex items-center gap-1.5 rounded-lg border border-slate-200
             bg-white px-3 text-left text-[12px] font-medium text-slate-700
             hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
>
  {value ? <span className="truncate flex-1">{value}</span> : <span className="truncate flex-1 text-slate-400">Select...</span>}
  <Icon icon="solar:alt-arrow-down-bold" width={9} height={9} className="shrink-0 text-slate-400" />
</button>

// Panel
<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
  <div className="relative border-b border-slate-100">
    <Icon icon="solar:magnifer-linear" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
    <input className="h-8 w-full bg-transparent pl-7 pr-2.5 text-[12px] font-medium" />
  </div>
  <div className="max-h-60 overflow-y-auto py-1">
    {/* Options */}
  </div>
</div>
```

### Grid Layout Classes

```tsx
// 12-column grid
<div className="grid grid-cols-12 gap-x-4 gap-y-5">

// GPS Settings: cols 1-7
<div className="col-span-7 space-y-4">

// Core Identity: cols 8-12
<div className="col-span-5 space-y-4">

// Physical Identity: cols 1-8
<div className="col-span-8 space-y-4">

// Technical Identifiers: cols 9-12
<div className="col-span-4 space-y-4">
```

### Label + Input Pattern

```tsx
<div className="space-y-1.5">
  <label className="text-[11px] font-medium text-slate-700">
    Registration Mark <span className="text-rose-500">*</span>
  </label>
  <input
    type="text"
    value={formData.registrationMark}
    onChange={(e) => updateData({ registrationMark: e.target.value })}
    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3
               text-[12px] font-medium text-slate-700
               placeholder:text-slate-400 placeholder:font-medium
               focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
    placeholder="e.g. ABC123"
  />
</div>
```

---

## 11. Add Vehicle Wizard — Step 2: Media & Documents

**Source**: `components/ui/fleet/wizard/steps/MediaUploadForm.tsx`

### Step 2 Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Upload vehicle registration documents and photos.                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Vehicle Registration Document (VRD)                                  │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐                   │  │
│  │  │   VRD Front         │  │   VRD Back          │                   │  │
│  │  │   [Drop or click]  │  │   [Drop or click]  │                   │  │
│  │  │   PNG, JPG, PDF    │  │   PNG, JPG, PDF    │                   │  │
│  │  │   Max 10MB         │  │   Max 10MB         │                   │  │
│  │  └─────────────────────┘  └─────────────────────┘                   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Vehicle Photos                                                        │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                                    │  │
│  │  │ + │ │ img │ │ img │ │ img │  [+ Add Photo]                      │  │
│  │  └─────┘ └─────┘ └─────┘ └─────┘                                    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Upload Zone Anatomy

```tsx
<div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 p-6
               hover:border-blue-300 hover:bg-blue-50/20 transition-colors cursor-pointer">
  <div className="flex flex-col items-center justify-center gap-3 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
      <Icon icon="solar:upload-bold" width={24} height={24} className="text-slate-400" />
    </div>
    <div>
      <p className="text-[12px] font-semibold text-slate-700">Drop files here or click to upload</p>
      <p className="text-[11px] text-slate-500">PNG, JPG, PDF up to 10MB</p>
    </div>
  </div>
</div>
```

### Uploaded Document Preview

```tsx
<div className="relative overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
  {/* Preview image */}
  <img src={previewUrl} alt="VRD Front" className="h-full w-full object-cover" />

  {/* Success overlay */}
  <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center">
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5
                     text-[10px] font-semibold uppercase tracking-wide text-emerald-700
                     ring-1 ring-inset ring-emerald-200/70">
      <Icon icon="solar:check-circle-bold" width={10} height={10} />
      Uploaded
    </span>
  </div>

  {/* Remove button */}
  <button className="absolute right-2 top-2 rounded-md bg-white/80 p-1 hover:bg-white">
    <Icon icon="solar:trash-bin-trash-bold" width={12} height={12} className="text-rose-500" />
  </button>
</div>
```

### Photo Gallery Grid

```tsx
<div className="grid grid-cols-4 gap-3">
  {/* Add photo button */}
  <div className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40
                  flex items-center justify-center hover:border-blue-300 cursor-pointer">
    <Icon icon="solar:add-circle-bold" width={24} height={24} className="text-slate-400" />
  </div>

  {/* Uploaded photo */}
  <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
    <img src={url} alt="" className="h-full w-full object-cover" />
    <button className="absolute right-1 top-1 rounded-md bg-white/80 p-1 hover:bg-white">
      <Icon icon="solar:trash-bin-trash-bold" width={10} height={10} className="text-rose-500" />
    </button>
  </div>
</div>
```

### Section Title Pattern

```tsx
<div className="flex items-center gap-2">
  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700
                  ring-1 ring-inset ring-blue-100">
    <Icon icon="solar:file-bold" width={14} height={14} />
  </div>
  <h3 className="text-[14px] font-semibold text-slate-900">Vehicle Registration Document (VRD)</h3>
</div>
```

---

## 12. Add Vehicle Wizard — Step 3: Insurance & Remarks

**Source**: `components/ui/fleet/wizard/steps/InsuranceAndRemarksStep.tsx`

### Step 3 Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Insurance Policy                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Policy No.: [____________________________]                         │  │
│  │  Insurance Company: [____________________]                         │  │
│  │  Coverage Type: [_________________________]                         │  │
│  │  Start Date: [____/____/________]    End Date: [____/____/________]  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Named Drivers                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  [+ Add Driver]                                                      │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐│  │
│  │  │  Driver Name: [____________________]  License No.: [__________] ││  │
│  │  │  Contact: [________________________]            [Remove]        ││  │
│  │  └─────────────────────────────────────────────────────────────────┘│  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Insurance Document Upload                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  [Drop or click to upload insurance document]                       │  │
│  │  PNG, JPG, PDF up to 10MB                                          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Licence Details                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Licence No.: [____________________________]                         │  │
│  │  Issue Date: [____/____/________]    Expiry: [____/____/________] │  │
│  │  Conditions: [_________________________]                          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Remarks                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  [________________________________________________________________]│  │
│  │  [________________________________________________________________]│  │
│  │  [________________________________________________________________]│  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Insurance Policy Section

```tsx
<div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/30 p-4">
  <div className="flex items-center gap-2">
    <Icon icon="solar:shield-check-bold" width={16} height={16} className="text-blue-600" />
    <h3 className="text-[14px] font-semibold text-slate-900">Insurance Policy</h3>
  </div>

  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-slate-700">Policy No.</label>
      <input className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 ..." />
    </div>
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-slate-700">Insurance Company</label>
      <input className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 ..." />
    </div>
  </div>
</div>
```

### Named Drivers Section

```tsx
<div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/30 p-4">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Icon icon="solar:users-group-two-rounded-bold" width={16} height={16} className="text-violet-600" />
      <h3 className="text-[14px] font-semibold text-slate-900">Named Drivers</h3>
    </div>
    <button className="inline-flex items-center gap-1.5 h-7 rounded-md bg-blue-600 px-2.5
                       text-[11px] font-medium text-white hover:bg-blue-700">
      <Icon icon="solar:add-bold" width={10} height={10} />
      Add Driver
    </button>
  </div>

  {/* Driver card */}
  <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-700">Driver Name</label>
        <input className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 ..." />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-700">License No.</label>
        <input className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 ..." />
      </div>
    </div>
    <div className="flex items-center justify-between">
      <div className="space-y-1 flex-1">
        <label className="text-[11px] font-medium text-slate-700">Contact</label>
        <input className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 ..." />
      </div>
      <button className="ml-3 inline-flex items-center gap-1 h-7 rounded-md px-2.5
                         text-[11px] font-medium text-rose-600 hover:bg-rose-50">
        <Icon icon="solar:trash-bin-trash-bold" width={10} height={10} />
        Remove
      </button>
    </div>
  </div>
</div>
```

### Remarks Textarea

```tsx
<div className="space-y-1.5">
  <label className="text-[11px] font-medium text-slate-700">Remarks</label>
  <textarea
    rows={4}
    value={formData.remarks}
    onChange={(e) => updateData({ remarks: e.target.value })}
    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2
               text-[12px] font-medium text-slate-700
               placeholder:text-slate-400 placeholder:font-medium
               focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
    placeholder="Additional notes about this vehicle..."
  />
</div>
```

---

## 13. Add Vehicle Wizard — Design Tokens

### WizardLayout Structure

```tsx
<div className="flex min-h-0 flex-1 gap-0">
  {/* Main content */}
  <div className="flex flex-1 flex-col min-w-0">
    {/* Progress strip */}
    <div className="border-b border-slate-200">
      {/* Step indicators */}
    </div>

    {/* Step content */}
    <div className="flex-1 overflow-y-auto">
      <div className="p-6">
        {/* Step content here */}
      </div>
    </div>

    {/* Footer */}
    <div className="border-t border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost">Cancel</Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" startIcon={<Icon icon="solar:floppy-disk-bold" />}>
            Save Draft
          </Button>
          <Button variant="primary" endIcon={<Icon icon="solar:arrow-right-bold" />}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  </div>

  {/* Summary sidebar */}
  <div className="w-80 shrink-0 border-l border-slate-200 bg-slate-50/30 overflow-y-auto">
    <div className="p-5">
      {/* Summary content */}
    </div>
  </div>
</div>
```

### Summary Card Anatomy

```tsx
<div className="space-y-5">
  {/* Header */}
  <div>
    <h3 className="text-[14px] font-semibold text-slate-900">Summary</h3>
    <p className="text-[11px] text-slate-500 mt-0.5">Vehicle information</p>
  </div>

  {/* Owner section */}
  <div className="space-y-2">
    <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500">Owner</span>
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon icon="solar:buildings-bold" width={12} height={12} className="text-slate-400" />
        <span className="text-[12px] font-medium text-slate-700">{orgName}</span>
      </div>
    </div>
  </div>

  {/* Vehicle summary */}
  <div className="space-y-2">
    <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500">Vehicle</span>
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
      <div className="text-[12px] font-semibold text-slate-900">{registrationMark || "—"}</div>
      <div className="text-[11px] text-slate-500">{make} {model}</div>
    </div>
  </div>

  {/* Attachments */}
  <div className="space-y-2">
    <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-slate-500">Attachments</span>
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <Icon icon="solar:paperclip-horizontal-bold" width={12} height={12} className="text-slate-400" />
        <span className="text-[12px] font-medium text-slate-700">
          {documentCount} document{documentCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  </div>
</div>
```

### Button Variants (Wizard Footer)

```tsx
// Cancel button
<button className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-transparent
                   px-3.5 text-[13px] font-medium text-slate-700
                   hover:bg-slate-100 cursor-pointer transition-colors">

// Save Draft button
<button className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-slate-200
                   bg-white px-3.5 text-[13px] font-medium text-slate-700 shadow-sm
                   hover:bg-slate-50 cursor-pointer transition-colors">

// Continue button
<button className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-blue-600
                   bg-blue-600 px-3.5 text-[13px] font-medium text-white shadow-sm
                   hover:bg-blue-700 cursor-pointer transition-colors">
```

---

## 14. Bulk Add Vehicles Modal

**Source**: `components/admin/vehicles/BulkAddVehiclesModal.tsx`

### Modal Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Bulk Add Vehicles                                            [×]           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Add multiple vehicles at once using a simple table format.                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Registration | Vehicle Class ▾ | Make ▾ | Model                   │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │  [__________] [Select class  ] [Select make] [___________]    [🗑]  │  │
│  │  [__________] [Select class  ] [Select make] [___________]    [🗑]  │  │
│  │  [__________] [Select class  ] [Select make] [___________]    [🗑]  │  │
│  │  ...                                                                │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│  [+ Add Row]                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Cancel]                                    [Add X Vehicles]             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Bulk Table Columns

| Column | Width | Notes |
|---|---|---|
| Registration Mark | 140px | Text input, required |
| Vehicle Class | 160px | Searchable dropdown |
| Make | 160px | Searchable dropdown |
| Model | flex-1 | Text input |

### Bulk Row Input Style

```tsx
// Text input in bulk table
<input
  type="text"
  value={row.registrationMark}
  onChange={(e) => updateRow(row._id, { registrationMark: e.target.value })}
  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5
             text-[12px] font-medium text-slate-700
             placeholder:text-slate-400 placeholder:font-medium
             focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
  placeholder="ABC123"
/>
```

### Row Actions

| Action | Icon | Variant | Notes |
|---|---|---|---|
| Delete row | `solar:trash-bin-trash-bold` | `danger` | Removes row from table |

### Add Row Button

```tsx
<button className="inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-dashed
                   border-slate-300 px-3 text-[12px] font-medium text-slate-500
                   hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/40 cursor-pointer transition-colors">
  <Icon icon="solar:add-bold" width={12} height={12} />
  Add Row
</button>
```

### Bulk Submit Button

```tsx
<button
  className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-blue-600
             bg-blue-600 px-3.5 text-[13px] font-medium text-white shadow-sm
             hover:bg-blue-700 cursor-pointer transition-colors
             disabled:opacity-50 disabled:cursor-not-allowed"
  disabled={!isValid || isSubmitting}
>
  {isSubmitting ? (
    <>
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      Adding...
    </>
  ) : (
    <>Add {rowCount} Vehicle{rowCount !== 1 ? "s" : ""}</>
  )}
</button>
```

---

## 15. Vehicle Action Modals

### View Vehicle Modal

**Trigger**: Click on vehicle row → opens detail drawer/modal

| Section | Content |
|---|---|
| Vehicle Info | Reg. Mark, Make/Model, Class |
| Organization | Org name, Management Group |
| Contract | Contract number, Status |
| GPS | Device ID, GPS Plate Number |
| Technical | VIN, TPL Code |
| Dimensions | Length, Width, Height, Weights |
| Insurance | Policy details (if available) |

### Pair Device Modal

**Trigger**: Click pair icon → `PairDeviceModal`

```tsx
<div className="space-y-4">
  <div className="space-y-1.5">
    <label className="text-[11px] font-medium text-slate-700">Device ID</label>
    <input
      type="text"
      placeholder="Enter device ID"
      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 ..."
    />
  </div>

  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
    <div className="flex items-start gap-2">
      <Icon icon="solar:info-circle-bold" width={14} height={14} className="text-amber-600 mt-0.5" />
      <p className="text-[11px] text-amber-800">
        Pairing links this vehicle with a GPS device for real-time tracking.
      </p>
    </div>
  </div>
</div>
```

### Promote to Physical Modal

**Trigger**: Click promote icon on virtual vehicle

```tsx
<div className="space-y-4">
  <div className="rounded-lg bg-violet-50 border border-violet-200 p-3">
    <p className="text-[12px] font-medium text-violet-900">
      This will promote "{registrationMark}" from a virtual to a physical vehicle.
    </p>
    <p className="text-[11px] text-violet-700 mt-1">
      This action cannot be undone.
    </p>
  </div>

  <div className="flex items-center gap-2">
    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
    <span className="text-[12px] text-slate-700">
      I confirm this vehicle is ready for physical tracking
    </span>
  </div>
</div>
```

### Delete Vehicle Modal

**Trigger**: Click delete icon

```tsx
<div className="space-y-4">
  <div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
    <div className="flex items-start gap-2">
      <Icon icon="solar:warning-circle-bold" width={14} height={14} className="text-rose-600 mt-0.5" />
      <div>
        <p className="text-[12px] font-medium text-rose-900">
          Delete "{registrationMark}"?
        </p>
        <p className="text-[11px] text-rose-700 mt-1">
          This action will soft-delete the vehicle. It can be restored later from the Deleted tab.
        </p>
      </div>
    </div>
  </div>

  {/* Type to confirm for hard delete */}
  <div className="space-y-1.5">
    <label className="text-[11px] font-medium text-slate-700">
      Type "{registrationMark}" to confirm
    </label>
    <input
      type="text"
      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 ..."
    />
  </div>
</div>
```

### Modal Anatomy (Hand-Coded)

```tsx
<AnimatePresence>
  {isOpen && createPortal(
    <div>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: MODAL_FADE_DURATION, ease: ANIMATION_EASE }}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Dialog */}
      <motion.div
        initial={{ opacity: 0, y: MODAL_SLIDE_DISTANCE }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: MODAL_SLIDE_DISTANCE }}
        transition={{ duration: MODAL_FADE_DURATION, ease: ANIMATION_EASE }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                   z-50 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
          <button className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-slate-100">
            <Icon icon="solar:close-circle-bold" width={16} height={16} className="text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {/* Content */}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirm}>Delete</Button>
        </div>
      </motion.div>
    </div>,
    document.body
  )}
</AnimatePresence>
```

---

## Appendix A: Icon Registry (Vehicles Page)

| Icon Name | Usage |
|---|---|
| `solar:car-bold` | Physical vehicle, active vehicle |
| `solar:ghost-bold` | Virtual vehicle |
| `solar:trash-bin-trash-bold` | Delete action, deleted vehicles |
| `solar:eye-bold` | View action |
| `solar:pen-bold` | Edit action |
| `solar:link-bold` | Pair device |
| `solar:unlink-bold` | Unpair device |
| `solar:rocket-launch-bold` | Promote to physical |
| `solar:wireless-charging-bold` | Device ID indicator |
| `solar:pie-chart-2-bold` | Status breakdown card |
| `solar:clock-circle-bold` | Recently joined card |
| `solar:add-bold` | Add action |
| `solar:add-circle-bold` | Add photo |
| `solar:upload-bold` | Upload zone |
| `solar:check-circle-bold` | Success state |
| `solar:warning-circle-bold` | Warning state |
| `solar:buildings-bold` | Organization |
| `solar:user-bold` | User/Owner |
| `solar:mailbox-bold` | Email |
| `solar:file-bold` | Document |
| `solar:shield-check-bold` | Insurance |
| `solar:users-group-two-rounded-bold` | Named drivers |
| `solar:paperclip-horizontal-bold` | Attachments |
| `solar:map-point-bold` | GPS settings |
| `solar:alt-arrow-down-bold` | Dropdown indicator |

---

## Appendix B: Translation Key Reference

| Key | English | Chinese (zh-HK) |
|---|---|---|
| `admin.vehiclesPage.title` | Vehicles | 車輛 |
| `admin.vehiclesPage.subtitle` | Manage vehicles linked to management groups. | 管理與車隊群組關聯的車輛。 |
| `admin.vehiclesPage.stats.physical` | Physical | 實體 |
| `admin.vehiclesPage.stats.virtual` | Virtual | 虛擬 |
| `admin.vehiclesPage.stats.deleted` | Deleted | 已刪除 |
| `admin.vehiclesPage.filters.pairing` | Pairing | 配對 |
| `admin.vehiclesPage.filters.all` | All | 全部 |
| `admin.vehiclesPage.filters.paired` | Paired | 已配對 |
| `admin.vehiclesPage.filters.unpaired` | Unpaired | 未配對 |
| `admin.vehiclesPage.status.active` | Active | 活躍 |
| `admin.vehiclesPage.status.upcoming` | Upcoming | 即將開始 |
| `admin.vehiclesPage.status.expired` | Expired | 已過期 |
| `fleet.wizard.step0.title` | Select Owner | 選擇持有人 |
| `fleet.wizard.step1.title` | Vehicle Details | 車輛詳情 |
| `fleet.wizard.step2.title` | Media & Documents | 媒體及文件 |
| `fleet.wizard.step3.title` | Insurance & Remarks | 保險及備註 |

---

*Document generated: 14 October 2026*
*Source files: `app/onefleet-system-admin/(dashboard)/vehicles/`, `components/ui/fleet/wizard/`, `components/admin/vehicles/`*
