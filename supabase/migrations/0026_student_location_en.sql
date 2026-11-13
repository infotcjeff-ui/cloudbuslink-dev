-- ============================================================================
--  Migration 0026: 學生 / 站點英文名稱 (學生摘要 Student Summary 報表)
--
-- 背景:
--   報表頁 /cbl-admin-setting/reports 的「匯出 Excel」需要依
--   excel/Student Summary.xlsx 的欄位格式輸出, 該模板含英文欄:
--     - Student Name      (C 欄)
--     - Pick Up Location  (I 欄)
--     - Drop Off Location (O 欄)
--   原本系統只有中文名稱, 英文欄無資料來源 → 新增這兩組欄位。
--
-- 欄位規則:
--   - cbl_students.name_en:  英文姓名, text NULL, 舊資料未回填。
--   - cbl_routes.stops 內的 waypoint location 為 jsonb → 用
--     jsonb_set 在 jsonb 陣列元素上補 'nameEn' 欄位, 不另建表。
--
-- ⚠️ 全部欄位皆 NULL 允許 — 舊資料沒有英文名稱, 不強制回填。
--    應用層在報表匯出時, 若無英文值則退回中文值。
-- ============================================================================

-- ---- cbl_students 英文姓名 ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cbl_students'
      AND column_name = 'name_en'
  ) THEN
    ALTER TABLE public.cbl_students
      ADD COLUMN name_en text NULL;
    COMMENT ON COLUMN public.cbl_students.name_en IS
      '英文姓名 (例: Chan Tai Man) — 學生摘要 Student Summary 報表用; null = 未提供, 匯出時退回中文姓名';
  END IF;
END $$;

-- ---- cbl_routes.stops 內 waypoint.location 補 nameEn ----
-- 說明:
--   stops 是 jsonb array, 每個元素形如:
--     { "id": "...", "location": { "name": "...", "address": "..." }, ... }
--   jsonb_set 需要「路徑」, array element 要用 index → 以 '[*].location'
--   不支援, 改以 lateral + with ordinality 逐元素處理。
DO $$
DECLARE
  idx integer;
  total integer;
  current_stops jsonb;
  new_stops jsonb;
  elem jsonb;
BEGIN
  SELECT count(*) INTO total
  FROM public.cbl_routes
  WHERE stops IS NOT NULL
    AND jsonb_typeof(stops) = 'array';

  FOR idx IN 0..(GREATEST(total, 1) - 1) LOOP
    SELECT r.stops INTO current_stops
    FROM public.cbl_routes r
    WHERE r.stops IS NOT NULL
      AND jsonb_typeof(r.stops) = 'array'
      AND r.stops->idx IS NOT NULL
    LIMIT 1;

    IF current_stops IS NULL THEN
      CONTINUE;
    END IF;

    elem := current_stops->idx;
    IF elem->'location' IS NULL THEN
      CONTINUE;
    END IF;

    new_stops := jsonb_set(
      current_stops,
      ARRAY[idx::text, 'location'],
      jsonb_set(
        elem->'location',
        ARRAY['nameEn'],
        to_jsonb(COALESCE(elem->'location'->>'nameEn', '')),
        true
      ),
      true
    );

    UPDATE public.cbl_routes
    SET stops = new_stops
    WHERE stops IS NOT NULL
      AND jsonb_typeof(stops) = 'array'
      AND stops->idx IS NOT NULL
      AND stops->idx->'location' IS NOT NULL
      AND (stops->idx->'location'->>'nameEn') IS NULL;
  END LOOP;
END $$;

-- ---- 驗證 ----
-- SELECT id, name, name_en FROM public.cbl_students
--  WHERE name_en IS NOT NULL LIMIT 20;
--
-- SELECT id, stops->0->'location' AS first_stop_location
--   FROM public.cbl_routes
--  WHERE stops IS NOT NULL
--    AND jsonb_typeof(stops) = 'array'
--    AND (stops->0->'location'->>'nameEn') IS NOT NULL
--  LIMIT 20;
