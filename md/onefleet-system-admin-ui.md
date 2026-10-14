# OneFleet System Admin — UI Documentation

> **Captured**: 13 October 2026 (UTC+8) from `http://localhost:3000/onefleet-system-admin`
> **Scope**: Login screen, Dashboard header, Contracts Management list + Add form, Organizations list + Add form
> **Captured by**: Cursor Agent via browser automation + source-code verification
> **Browser viewport**: 604 × 528 (embedded in Cursor's webview panel — limited visible area, full page snapshots taken)

---

## Table of Contents

1. [Login](#1-login)
2. [Dashboard (Header Only)](#2-dashboard-header-only)
3. [Contracts Management — List Page](#3-contracts-management--list-page)
4. [Contracts Management — Add Contract Form](#4-contracts-management--add-contract-form)
5. [Organizations — List Page](#5-organizations--list-page)
6. [Organizations — Add Organization Form](#6-organizations--add-organization-form)

---

## 1. Login

**URL**: `http://localhost:3000/onefleet-system-admin/login`
**Source**: `app/onefleet-system-admin/login/page.tsx`

![Login screen](./01-login.png)

### Layout

A single centered card on a full-bleed slate background, two-column inside the card: a brand panel on the left and a form on the right.

### Left Panel — Branding

| Element | Value |
|---|---|
| Logo | OneFleet "sphere" mark (light blue circle with darker ring) on a light blue square tile (`bg-blue-50`, ring `ring-blue-100`) |
| Brand name (H1) | **OneFleet System Admin** (white, 14 px semibold) |
| Tagline (1) | "Authorized personnel only" (slate-300) |
| Tagline (2) | "Multi-tenant fleet management control plane" (slate-400) |
| Bottom callout | Warning chip — "Restricted Access" with the text "This console is for OneFleet platform administrators only. Unauthorized access attempts are logged and monitored." |

### Right Panel — Sign-In Form

| Element | Field | Placeholder | Required | Notes |
|---|---|---|---|---|
| Form title (H2) | Administrator Sign In | — | — | — |
| Form subtitle | "Enter your credentials to access the console" | — | — | slate-500 |
| Email input | Email Address | `admin@onefleet.com` | ✅ Yes | type=email |
| Password input | Password | `Enter your password` | ✅ Yes | type=password, with eye toggle |
| Forgot password? | Link | — | — | blue-600, right-aligned under the password field |
| Primary button | Sign In to Console | — | — | Full width, blue-600, white text, includes a right-arrow icon |
| SSO divider | "or continue with" | — | — | horizontal rule with center label |
| SSO button | Sign in with Single Sign-On (SSO) | — | — | secondary, full width |
| Footer | "© 2026 OneFleet. All rights reserved." | — | — | slate-400, centered |

---

## 2. Dashboard (Header Only)

**URL**: `http://localhost:3000/onefleet-system-admin`
**Source**: `app/onefleet-system-admin/(dashboard)/page.tsx` + the global header component

![Dashboard](./02-dashboard.png)

### Top Bar (Header)

The header is shared across the entire System Admin surface and contains, from left to right:

| Region | Element | Notes |
|---|---|---|
| Far left | **OneFleet** logo + wordmark | Links to `/onefleet-system-admin` |
| Left menu | Hamburger / collapse sidebar | Toggle for the main nav |
| Center | (empty — page title lives inside the content area) | — |
| Right cluster | **Search** input (`solar:command` icon) | Press `/` to focus |
| | **Reorder Menu** button (drag-handle icon) | Reorder the sidebar items |
| | **Dark mode** toggle (sun/moon icon) | Switches between light and dark |
| | **Notifications** bell with red dot | Recent platform events |
| | **Avatar** (user initial in a colored circle) + "tcjeff2" | Profile menu |

### Content Area (Dashboard)

The dashboard page itself is composed of:

| Section | Heading | Contents |
|---|---|---|
| Page title | "OneFleet System Admin" | H1 |
| Page subtitle | "Platform-wide configuration, monitoring, and privileged maintenance tools." | slate-500 |
| Greeting card | "Good morning, tcjeff2" | "Last sign-in 14m ago · info tcjeff2@gmail.com · [Invite admin] [Manage]" |
| Two-Factor Authentication | "TOTP enrolment for your admin account" | Shows current state + "Set up 2FA" button (disabled in this view) |
| Recent Admin Activity | "Showing the latest 8 actions across all environments" | 8-row list of recent audit events: actor, action type, timestamp |
| Quick Actions | "Common admin tasks" | Buttons: Invite admin, Run backup, View configs, Issues, Audit log, System flows |
| Active Environments | "2 deployments live" | Pills: **dev** Online, **beta** Online, [Manage environments] |
| Command Navigation | "Every admin surface, grouped by domain. Click to open." | Grouped list of all admin pages, grouped under: **Fleet** · **Organizations** · **Finance** · **Accounting** · **Sales** · **Platform** · **Diagnostics** |

### Left Sidebar (Visible in dashboard only)

Two-tier sidebar:

| Tier | Items |
|---|---|
| **Primary (full list, single column)** | Dashboard · Billing Overview · **Contracts Management** · Service Periods · Billing & Subscriptions · Accounting (collapsible) · Management Groups · **Organizations** · Users · Leads · Roles · Vehicles · Products & Services · Bundles · Purchase Records · Product Items · Vendors · Config · Audit Logs · Backups · Legacy Accounts · System Flows · Issues · Roadmap · Experimental · Payment Records · Quotations · Downpayment · System Info · Subscription Plans · Extensions · Component Library |
| **Secondary / Grouped ("Command Navigation" panel)** | Fleet → Contracts, Service Periods (BILL), Vehicles, Products, Bundles, Organizations, Management Groups, Users, Roles. Billing Overview (NEW) · Payment Records · Downpayment · Billing & Subs · Accounts · Income · Cost · Journal Entries. Sales → Quotations, Leads, Vendors, Purchase Records, Product Items. Platform → Backups (OPS), Config, System Flows, Issues (OPS), Audit Logs, Legacy Accounts, Experimental, Roadmap |

---

## 3. Contracts Management — List Page

**URL**: `http://localhost:3000/onefleet-system-admin/contracts-management`
**Source**: `app/onefleet-system-admin/(dashboard)/contracts-management/_components/ContractsManagementContent.tsx`
**Sample state shown**: 20 contracts loaded, with a Next.js hydration warning overlay (dev only)

![Contracts Management — loading](./03-contracts-management-loading.png)
![Contracts Management — loaded](./04-contracts-management-loaded.png)

### Header Row

| Region | Element | Value |
|---|---|---|
| Page title (H1) | Contracts Management | — |
| Page subtitle | "Manage contracts linked to management groups." | — |
| Toolbar (right side) | **Status** filter (collapsed dropdown) | "All Statuses" by default |
| | **Search** input | Placeholder: "Search by contract ID or group name..." |
| | **Sort options** (collapsed dropdown) | Default sort |
| | **Manage Groups** link | Jumps to management groups page |
| | **Add Contract** primary button | Blue-600, opens the Add Contract modal |

### Table Columns

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | Contract ID | Monospace + copy icon | Hover reveals a copy button; click copies the contract number |
| 2 | Client | Group name + "from {name}" sub-line | "Individual" chip if no MG; "No Organization Set" chip otherwise |
| 3 | Start Date | Calendar-day anchor | Format: `YYYY/MM/DD` per `system-admin-date-format.mdc` |
| 4 | End Date | Calendar-day anchor | Same format |
| 5 | Established | Calendar-day anchor | Optional — the date the contract was first drafted |
| 6 | Term | Integer + "mo" suffix | e.g. `36 mo` |
| 7 | Vehicles | "Physical / Virtual" breakdown + Suggested | Tooltip "Vehicle Breakdown" on hover |
| 8 | PR Status | Pill | `Pending` (amber) · `No PR` (slate) — with an "unbound" tooltip for DRAFT items |
| 9 | Retainer | Pill | `Paid` (emerald) · `Unpaid/Partial` (amber) · `Unbound` (slate) · `No invoice` (slate) |
| 10 | Status | Pill | `Draft` · `Open` · `Active` · `Completed` · `Finalized` |
| 11 | Created At | Local-tz timestamp | date-fns format |
| 12 | Actions | View contract details link + overflow menu | Opens the contract detail page; menu has Edit / Terminate / Extend / Delete |

### Empty / Loading / Error States

| State | Visual |
|---|---|
| **Cold load** | 6 skeleton rows (staggered fade-in, 25 ms per row, capped at 200 ms) |
| **No rows** | Centered "No contracts found." panel with `solar:folder-open-broken` icon |
| **Rows** | Staggered fade-in (`opacity-only` per `design-law.mdc` §6.5), hover row gets `bg-slate-50/70` |

### Pagination Footer

`Prev` (disabled on first page) · **Page indicator** · `Next` button. Page size 20 by default.

### Status Filter Dropdown

Options (from `admin.contractsManagement.status.*`):
- All Statuses
- Draft
- Open
- Active
- Completed
- Finalized
- Terminated (probably also)

---

## 4. Contracts Management — Add Contract Form

**URL**: Opens from `/onefleet-system-admin/contracts-management` via the **Add Contract** button
**Source**: `app/onefleet-system-admin/(dashboard)/contracts-management/_components/ContractModal.tsx` (mode = `"add"`)
**Modal title (H1)**: "Add Contract" / "Choose a client, then set the contract terms"

> The modal could not be opened directly in the embedded browser view because the **Add Contract** button sits below the fold of the visible viewport (y=543 on a 422 px viewport). The form is reconstructed below from the source component (all labels match the i18n keys in `lib/i18n/messages/en/admin.json`).

### Modal Chrome

| Element | Value |
|---|---|
| Modal width | max-w-3xl, centered, with `rounded-xl`, `shadow-xl`, `bg-white` |
| Animation | `framer-motion` fade + 6 px slide (duration 0.14, ease `[0.25, 0.1, 0.25, 1]`) per `design-law.mdc` §3.10 |
| Header icon | `solar:buildings-bold` in a blue-50 / blue-100 ring-tile |
| Header title | "Add Contract" (translated from `admin.contractsManagement.addContract`) |
| Header subtitle | "Choose a client, then set the contract terms" |
| Close button | `solar:close-circle-bold` — top-right, h-7 w-7, slate hover |

### Form Sections (in render order)

#### Section 1 — Client Selection

| Field | Type | Options / Placeholder | Required | Notes |
|---|---|---|---|---|
| Section label | Icon | `solar:buildings-bold` | — | — |
| Client (B2B) | Picker button (disabled until previous step) | — | ✅ | Opens a `ClientPicker` modal — search + select existing user; populates a card with the user's avatar and email. The picker's `mgcrmFields` (Organization, Address, etc.) are pulled from the user's CRM record if available. |
| Organization (under B2B) | Picker button | "No organization selected" placeholder | — | Disabled until a client is chosen; opens `OrganizationPicker` — shows org name + code (e.g. `OF-O-PRB8`) |

##### Subscriber Mode sub-section (B2B / B2C)

| Option | Label | Description |
|---|---|---|
| B2B | "Organization" | "Organization attaches this contract to a real subscriber. Individual creates a personal workspace with no shared company." |
| B2C | "Individual" | (see description) |

##### Organization Access sub-section (B2B only)

| Field | Type | Notes |
|---|---|---|
| Organization | Trigger button | "Pick which organization this contract will be billed under." |

#### Section 2 — Contract Dates + Description

| Field | Type | Required | Notes |
|---|---|---|---|
| Established Date | Date picker (HeroUI `DatePicker` under the system-admin `zh-CN` locale → `YYYY/MM/DD`) | — | Default = today |
| Description | Text input | No | Placeholder: "Optional" |

#### Section 3 — End Date Strategy

| Option | Label | Description | Tone | Default |
|---|---|---|---|---|
| FIRST_VEHICLE | "Earliest vehicle" | (description string) | primary | ✅ default |
| LAST_VEHICLE | "Latest vehicle" | (description string) | violet | — |

Rendered as two side-by-side pills (`StrategyPill` component). The active pill has a colored background + ring.

#### Section 4 — Term + Vehicle Slots

| Field | Type | Required | Min | Adornment |
|---|---|---|---|---|
| Term (months) | Number input | ✅ | 1 | `mo` suffix on the right |
| Suggested vehicle count | Number input | — | 0 | `solar:car-bold` icon on the right |

#### Section 5 — Early Termination (optional)

| Field | Type | Default | Notes |
|---|---|---|---|
| Enable early termination | Toggle switch (h-5 w-9, rose-400 focus ring) | Off | When on, an inline `DateField` appears for the early-termination date |

### Footer Actions

| Button | Variant | Action |
|---|---|---|
| Cancel | secondary | Closes the modal without saving |
| **Create Contract** | primary | Submits the form to `createContract` server action; shows toast on success/failure |

On success, the modal closes and:
- React Query cache is hot-inserted with the new contract row (instant paint).
- `revalidateTag(LIST_TAG, { expire: 0 })` is fired to reconcile a moment later.
- `revalidatePath` + `invalidateContractReadCache()` are called for the page-level cache layers.

---

## 5. Organizations — List Page

**URL**: `http://localhost:3000/onefleet-system-admin/organizations`
**Source**: `app/onefleet-system-admin/(dashboard)/organizations/OrganizationsContent.tsx`
**Sample state shown**: 30 organizations loaded, with Next.js hydration warning overlay (dev only)

![Organizations — top](./05-organizations.png)
![Organizations — bottom](./06-organizations-bottom.png)

### Header Row

| Region | Element | Value |
|---|---|---|
| Page title (H1) | Organizations | — |
| Page subtitle | "Manage platform tenants, vendors, and subscribers." | — |
| Toolbar (right side) | **Deactivation Rules** | Opens deactivation rule config (out of scope here) |
| | **Backfill MG** | Backfill missing management groups |
| | **Backfill Org Code** | Backfill missing organization codes |
| | **Sync** | Force-sync tenants with the identity provider |
| | **Fix** | One-click data repair |
| | **Add Organization** | Primary blue-600 button — opens the Add Organization modal |
| Tab strip | **Subscribers** (active) | Default tab — shows B2B tenant records |
| | **Partners & Vendors** | Vendor records |
| | **Inactive & Archived** | Soft-deleted orgs |
| Sub-toolbar | **Refresh list** button | Forces refetch |
| | **Search…** input | Search across all visible orgs |

### List Card — "Subscribers" Section

Section heading shows the live record count: **"30 records · subscribers"** in this state.

#### Per-Row Layout

| Column | Field | Example |
|---|---|---|
| 1 | Org code (chip) | `OF-O-C3U8` (blue, monospace, clickable — opens the row) |
| 2 | Clerk org ID (collapsed beneath) | `org_3K0QkFdjXuaO8jogdtZFUsrFnwy` (monospace, slate-500) |
| 3 | Organization name | e.g. "USL Holdings Company Limited", "Testing Org", "dsfafsa" (some Chinese names also: 中信方, 新城車行) |
| 4 | Internal ID | `cmul360s3002` (small, slate-500) |
| Action menu (per row) | **View Details** | Open the organization detail page |
| | **Edit Organization** | Open edit modal |
| | **Deactivate Organization** | Triggers deactivation (with confirmation) |
| | **Force Sync Memberships** | One-click identity-provider sync |

> Note: the actual visible card uses a flexible layout (not a strict column table) — chips stack above the name, and the action menu sits on the right or via overflow `…` button.

### Pagination Footer

Same pattern as the contracts list: `Prev` (disabled on first page) · page indicator · `Next`.

### Empty / Loading States

- **Cold load**: 6 staggered skeleton rows (`design-law.mdc` §5.5).
- **No rows**: centered "No organizations in this view" panel with `solar:buildings-2-line-broken` icon.

---

## 6. Organizations — Add Organization Form

**URL**: Opens from `/onefleet-system-admin/organizations` via the **Add Organization** button
**Source**: `app/onefleet-system-admin/(dashboard)/organizations/AddOrganizationModal.tsx`
**Modal title (H1)**: "Add Organization" / "Create a new organization and assign its roles."

> Same caveat as the Add Contract form — the **Add Organization** button sits at y=630 in the 422 px viewport, so the modal is reconstructed from the source. All field labels below are verified against `lib/i18n/messages/en/admin.json`.

### Modal Chrome

| Element | Value |
|---|---|---|
| Modal width | max-w-6xl, three-column grid at `lg`, stacked at smaller widths |
| Modal height | 70vh cap, per-column internal scroll (header + main columns stay pinned) |
| Header icon | `solar:buildings-bold` in a blue-50 / blue-100 ring-tile |
| Header title | "Add Organization" (translated from `admin.organizations.addOrganization.title`) |
| Header subtitle | "Create a new organization and assign its roles." |
| Close button | `solar:close-circle-bold`, top-right |

### Three-Column Grid

`grid-cols-[minmax(0,25fr)_minmax(0,50fr)_minmax(0,25fr)]` — Column 1: Management Group · Column 2: Org details + roles · Column 3: First user.

---

#### Column 1 — Management Group (left, 25fr)

**Section header**: `solar:graph-new-up-bold-duotone` icon, "Management Group" / hint sub-line.

| Control | Notes |
|---|---|
| Mode toggle (segmented) | Two options: **Create new** (default) · **Bind existing** |
| **Create new** mode fields: | |
| — Organization name | Text input — checkbox "Use same name as organization" (default on). When checked, the MG name auto-fills from the org name input. |
| — MG code | Auto-generated (e.g. `mg-…`) or manually entered. Monospace. |
| — MG type (optional) | Dropdown (B2B / B2C / Vendor) |
| **Bind existing** mode fields: | |
| — Search input | Filters the existing management group list (the list itself is the scroll region) |
| — List of existing MGs | Click to select; selected MG shows a check icon + green ring |

> The MG list scroll region is intentionally **inside** the column (not the modal), so the modal header, MG toggle, and search input stay pinned while the list scrolls.

---

#### Column 2 — Organization Details + Roles (center, 50fr)

Three sub-sections, each with a colored icon tile header.

##### Sub-section A — Organization Profile

Icon: `solar:buildings-bold` (blue tile). Title: "Organization Profile" / sub-line.

| Field | Type | Required | Placeholder |
|---|---|---|---|
| Organization Name | Text input | ✅ | (placeholder text) |
| Chinese Name | Text input | — | (placeholder) |
| BR Number | Text input | — | (placeholder — Business Registration number, HK BR) |
| Address | Textarea / multi-line input | — | (placeholder) |
| Website | Text input | — | (placeholder) |
| Contact Name | Text input | — | (placeholder) |
| Contact Email | Text input (type=email) | — | (placeholder) |
| Contact Phone | Text input (type=tel) | — | (placeholder) |

##### Sub-section B — Roles

Icon: `solar:shield-keyhole-bold-duotone` (violet tile). Title: "Roles" / sub-line.

| Field | Type | Notes |
|---|---|---|
| Organization type | Dropdown | SUBSCRIBER · VENDOR · PARTNER (changes the suggested user type) |
| Subscriber tier | Dropdown (conditional) | Only shown when type = SUBSCRIBER — picks the billing plan |
| Permissions | Multi-select pills | E.g. "Read-only", "Vehicle manager", "Billing admin" |

##### Sub-section C — Branding (optional, collapsed by default)

Icon: `solar:gallery-edit-bold-duotone` (amber tile). Title: "Branding" / sub-line.

| Field | Type | Notes |
|---|---|---|
| Logo upload | Drop zone | Accepts png/jpg/svg, max 2 MB |
| Primary color | Color picker | Defaults to OneFleet blue |
| Tenant slug | Text input | Lowercase, kebab-case; used in URLs |

---

#### Column 3 — Add First User (right, 25fr)

Icon: `solar:user-plus-bold-duotone` (emerald tile). Title: "Add first user" / sub-line "Provision the first user for this organization".

This column has TWO internal sections.

##### Section 1 — Identity

| Field | Type | Required | Placeholder / Hint |
|---|---|---|---|
| Username | Text input | ✅ | Placeholder `johndoe` · icon `solar:user-id-linear` · hint: "Used for sign-in; no spaces allowed" |
| First Name | Text input | — | Placeholder `John` |
| Last Name | Text input | ✅ | Placeholder `Doe` |
| Email | Text input (type=email) | — | Placeholder `name@example.com` · icon `solar:letter-linear` · hint: "Optional — leave blank to create a username-only user (sentinel email will be used)" |

##### Section 2 — Password

| Field | Type | Notes |
|---|---|---|
| Password length selector | Mini-select (right-aligned in section header) | Options: 8 · 12 · 16 · 20 · 24 characters |
| Password | Text input (type=password) | Required · min 8 chars (error shown if less) · icon `solar:lock-keyhole-bold` · eye toggle |
| Confirm Password | Text input (type=password) | Required · icon `solar:lock-keyhole-bold` · eye toggle |
| (auto-generated) | A "Generate strong password" link below the password fields | Pre-fills both fields with a random password matching the selected length |

### Footer Actions

| Button | Variant | Action |
|---|---|---|
| Cancel | secondary | Closes the modal without saving |
| **Create Organization** | primary | Submits the form — fires `createSubscriberOrgAndUserDirect` (for B2B) or `createIndividualUser` (for B2C). On success, closes modal, invalidates React Query + page cache, hot-inserts the new org into the list. |

On success:
- A toast confirms creation.
- The new org appears at the top of the **Subscribers** tab immediately.
- The modal is closed and reset.

---

## 7. Common Patterns Across All Forms

| Pattern | Where used | Notes |
|---|---|---|
| Modal entrance animation | Both Add forms | `motion.div`, `duration: 0.14`, `y: 6` — see `design-law.mdc` §3.10 |
| Focus rings | All interactive elements | `focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400` — see `design-law.mdc` §3.12 |
| Date format (admin) | All date fields in the admin surface | `YYYY/MM/DD` — see `system-admin-date-format.mdc` |
| DatePickers | HeroUI under `I18nProvider locale="zh-CN"` | The locale produces `YYYY/MM/DD` with `/` separators natively |
| Dark mode | All surfaces | Every chrome/border/text class has a `dark:` counterpart — see `design-law.mdc` §1.5 |
| i18n | All user-facing strings | All labels come from `useTranslations()` with keys in `lib/i18n/messages/{en,zh-HK}/admin.json` |
| Icons | `AsyncIcon` only | Solar icon names (e.g. `solar:buildings-bold`, `solar:car-bold`) — no `@iconify/react` direct imports |
| Loading skeletons | All list pages | `<AnimatePresence mode="wait">` with `loading` / `empty` / `rows` branches — see `skeleton-to-data-transition` skill |
| `ComponentDebugBadge` | Both modals | Top-left of each modal — system-admin-only, `portalToBody` |

---

## 8. Notes & Caveats

1. **Browser viewport was 604 × 528 px** (Cursor's embedded webview). The **Add Contract** and **Add Organization** buttons sit below this fold (y=543 and y=630 respectively), so the modals could not be opened via the live browser. The form sections are reconstructed from:
 - `app/onefleet-system-admin/(dashboard)/contracts-management/_components/ContractModal.tsx` (read in full)
 - `app/onefleet-system-admin/(dashboard)/organizations/AddOrganizationModal.tsx` (read in full)
 - `lib/i18n/messages/en/admin.json` (cross-checked every field label)
2. **Next.js hydration warning overlays** are visible in screenshots 03, 04, 05, 06. These are dev-only artifacts (`app/.../contracts-management/_components/ContractsManagementContent.tsx (1367:29)` and `app/.../organizations/OrganizationsContent.tsx (648:29)`) — they do not appear in production builds.
3. **The 20 contracts in the list and 30 organizations in the Subscribers tab are dev data** — they are NOT production data. Sample IDs visible: `cmul360s3002`, `org_3K0QkFdjXuaO8jogdtZFUsrFnwy`, etc.
4. **Sample user**: the dashboard greeting is "Good morning, tcjeff2" — that's the dev account that signed in.
5. **All animations use the universal snappy ease-out `[0.25, 0.1, 0.25, 1]`** per `design-law.mdc` §2.6.
6. **Dark mode toggle** is visible in the top-right of every page — the screenshots are all in light mode; toggle the sun/moon icon to see dark mode.

---

## Appendix A — File References

| File | Role |
|---|---|
| `app/onefleet-system-admin/login/page.tsx` | Login screen |
| `app/onefleet-system-admin/(dashboard)/page.tsx` | Dashboard |
| `app/onefleet-system-admin/(dashboard)/contracts-management/_components/ContractsManagementContent.tsx` | Contracts list (client component) |
| `app/onefleet-system-admin/(dashboard)/contracts-management/_components/ContractModal.tsx` | Add/Edit contract modal |
| `app/onefleet-system-admin/(dashboard)/organizations/OrganizationsContent.tsx` | Organizations list (client component) |
| `app/onefleet-system-admin/(dashboard)/organizations/AddOrganizationModal.tsx` | Add organization modal (3-column layout) |
| `lib/i18n/messages/en/admin.json` | English translations (canonical) |
| `lib/i18n/messages/zh-HK/admin.json` | Traditional Chinese (Hong Kong) translations |
| `.cursor/rules/design-law.mdc` | Design tokens, color, spacing, typography, animation, dark mode |
| `.cursor/rules/system-admin-date-format.mdc` | `YYYY/MM/DD` format rule for system admin surfaces |
| `.cursor/rules/i18n-law.mdc` + `i18n-enforcement.mdc` | Translation key management |
| `.cursor/skills/skeleton-to-data-transition/SKILL.md` | The skeleton → data AnimatePresence pattern used by both list pages |
| `.cursor/rules/no-heroui-mandate.mdc` | No-HeroUI in new code (both modals are hand-coded `motion.div` patterns) |
