-- ============================================================================
--  Migration 0015: 學生的就讀學校欄位 (類型 / 區域 / 學校名稱)
--
--  背景:
--   1. 新增學生時需要記錄「就讀哪一間學校」— 校巴服務按學校/分區排線,
--      沒有學校資訊就無法自動配對路線。
--   2. 學校名單來自 CHSC (家校/學校資訊中心) 的公開資料集:
--        小學概覽: https://data.gov.hk/tc-data/dataset/chsc-chsc-primary-school-profiles
--        中學概覽: https://data.gov.hk/tc-data/dataset/chsc-chsc-secondary-school-profiles
--      透過 scripts/fetch-schools.mjs 抓取並打包成 lib/data/schools.json。
--   3. 三欄拆開存 (而非只存一個 school 名稱) 的原因:
--        - 「區域 + 類型 + 名稱」在資料集內唯一 → 可以精準驗證,
--          避免同名學校 (例: 中西區與沙田區都有「培僑書院」) 混淆。
--        - 排線時可以直接依區域分組, 不必每次都做字串比對。
--
--  欄位規則:
--   - school_type:      text NULL,  'primary' (小學) / 'secondary' (中學)
--   - school_district:  text NULL,  18 區之一 (例: '沙田區')
--   - school_name:      text NULL,  學校名稱 (例: '聖公會聖馬太小學')
--   - 三欄皆 NULL 允許 — 舊資料沒有學校資訊, 不強制回填。
--     (但應用層新增學生時會要求必填)
-- ============================================================================

-- ---- cbl_students 就讀學校欄位 ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cbl_students'
      AND column_name = 'school_type'
  ) THEN
    ALTER TABLE public.cbl_students
      ADD COLUMN school_type text NULL;
    COMMENT ON COLUMN public.cbl_students.school_type IS
      '就讀學校類型 — primary=小學 / secondary=中學 (來源: CHSC 小學/中學概覽)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cbl_students'
      AND column_name = 'school_district'
  ) THEN
    ALTER TABLE public.cbl_students
      ADD COLUMN school_district text NULL;
    COMMENT ON COLUMN public.cbl_students.school_district IS
      '就讀學校所在區域 — 18 區之一 (例: 沙田區)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cbl_students'
      AND column_name = 'school_name'
  ) THEN
    ALTER TABLE public.cbl_students
      ADD COLUMN school_name text NULL;
    COMMENT ON COLUMN public.cbl_students.school_name IS
      '就讀學校名稱 (例: 聖公會聖馬太小學)';
  END IF;
END $$;

-- ---- index: 依區域 / 學校查學生 (排線時常用) ----
CREATE INDEX IF NOT EXISTS idx_cbl_students_school_district
  ON public.cbl_students (school_district);

CREATE INDEX IF NOT EXISTS idx_cbl_students_school_name
  ON public.cbl_students (school_name);

-- ---- 複合 index: 同時依「區域 + 類型」篩選 (前端表格篩選用) ----
CREATE INDEX IF NOT EXISTS idx_cbl_students_school_district_type
  ON public.cbl_students (school_district, school_type);
