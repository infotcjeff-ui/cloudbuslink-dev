# CloudBusLink - 校巴點名打卡系統

> Mobile-First 校巴管理系統，採用 Next.js + shadcn/ui + Framer Motion + MapLibre

## 🎯 系統概覽

CloudBusLink 是一個專為校巴運營設計的行動優先 Web 應用，提供完整的工作流程：

1. **校巴管理** - 管理校巴、司機、學生、家長、保姆
2. **班次排程** - 創建每日班次，規劃路線站點
3. **點名打卡** - 保姆即時確認學生上/下車
4. **GPS 追蹤** - 地圖實時顯示校巴位置
5. **報表匯出** - Excel 格式完整行程記錄
6. **公告系統** - 站內公告與範本管理

## 🔑 角色權限

| 角色 | 登入 | 主要功能 |
|------|------|----------|
| 系統管理員 (Super Admin) | ✅ | 全系統管理 |
| 客戶 (Client) | ✅ | 校內資料管理、報表、公告 |
| 家長 (Parent) | ✅ | 查看子女乘車狀態 |
| 保姆 (Nanny) | ✅ | 點名打卡、查看班次 |
| 學生 (Student) | ❌ | 資料實體、被綁定 |
| 司機 (Driver) | ❌ | 資料實體、GPS 追蹤 (預留) |

## 🚀 快速開始

### 安裝依賴

```bash
npm install
```

### 啟動開發伺服器

```bash
npm run dev
```

訪問 [http://localhost:3000](http://localhost:3000)

## 🔐 示範帳戶

登入頁提供一鍵登入按鈕，或使用以下帳戶：

| 角色 | 電話 | 密碼 |
|------|------|------|
| 系統管理員 | `90000001` | `admin123` |
| 客戶 (校長) | `90000002` | `client123` |
| 保姆 | `90000003` | `nanny123` |
| 家長 | `90000005` | `parent123` |

## 🛠 技術棧

- **框架**: Next.js 14 (App Router)
- **樣式**: Tailwind CSS
- **UI 組件**: shadcn/ui (Radix UI)
- **圖標**: lucide-react
- **動畫**: Framer Motion
- **地圖**: MapLibre GL JS + OpenStreetMap
- **Excel**: xlsx (SheetJS)
- **資料儲存**: localStorage (Demo 階段，預備接入 Supabase)

## 📁 專案結構

```
/
├── app/                          # Next.js App Router
│   ├── page.tsx                 # 登入頁
│   ├── layout.tsx               # 根佈局
│   ├── globals.css              # 全域樣式
│   └── portal/                  # 已登入區域
│       ├── layout.tsx           # Portal 佈局 (Header + Bottom Nav)
│       ├── home/                # 地圖首頁
│       ├── trips/               # 班次管理
│       │   ├── page.tsx         # 班次列表
│       │   ├── new/             # 新增班次
│       │   └── [id]/            # 班次詳情
│       │       ├── page.tsx
│       │       └── checkin/     # 點名打卡
│       ├── students/            # 學生管理
│       ├── parents/             # 家長管理
│       ├── buses/               # 校巴管理
│       ├── drivers/             # 司機管理
│       ├── nannies/             # 保姆管理
│       ├── announcements/       # 公告管理
│       ├── reports/             # 報表中心
│       └── settings/            # 設定
│           ├── page.tsx         # 設定主頁
│           ├── profile/         # 個人資料
│           ├── site/            # 網站設定
│           └── binding/         # 家長綁定子女
├── components/
│   └── ui/                      # shadcn/ui 基礎組件
├── lib/
│   ├── types.ts                 # TypeScript 類型定義
│   ├── storage.ts               # localStorage 數據層
│   ├── mock-data.ts             # 預設數據
│   ├── hooks.ts                 # React Hooks
│   └── utils.ts                 # 工具函數
└── public/                      # 靜態資源
```

## ✨ 主要特色

### 1. 行動優先設計 (Mobile-First)
- 100% 針對手機端優化
- 大拇指操作區，所有按鈕 ≥ 44x44px
- Liquid Glass 底部導航

### 2. 零 Hover 效果
- 所有互動採用 active 狀態
- 符合 2026 行動端 UX 趨勢

### 3. 角色感知 UI
- 根據用戶角色動態顯示功能選單
- 不同角色看到的介面不同

### 4. 完整工作流程
從校巴新增 → 學生綁定 → 班次建立 → 點名打卡 → 報表匯出，全流程串接。

### 5. 智能站點生成
新增班次時，根據已綁定校巴的學生位置，自動生成上/下車站點。

## 🗺 地圖功能

- MapLibre GL JS + OpenStreetMap (無需 API Key)
- 校巴實時位置模擬更新
- 自動適配所有校巴的視野
- 校巴詳情彈窗

## 📊 報表欄位

匯出的 Excel 包含兩個工作表：
1. **行程報表** - 每位學生每個站點的詳細打卡記錄
2. **學生出席統計** - 出席率、遲到次數等統計

## 🔄 接入 Supabase

當 Supabase API Key 準備好時，只需替換 `lib/storage.ts` 的實作：

```typescript
// 將 localStorage 操作改為 Supabase 操作
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 例如：
export const studentStorage = {
  getAll: async () => {
    const { data } = await supabase.from('students').select('*');
    return data;
  },
  // ... 其他方法
};
```

## 📝 開發路線圖

- [x] 認證系統
- [x] 學生/家長/校巴/司機/保姆 CRUD
- [x] 班次管理
- [x] 點名打卡核心
- [x] 地圖整合
- [x] 報表 Excel 匯出
- [x] 公告系統
- [x] 網站設定
- [ ] Supabase 接入
- [ ] 付費系統
- [ ] 家長推播通知
- [ ] GPS 真實接入

## 📄 授權

© 2026 CloudBusLink. All rights reserved.
