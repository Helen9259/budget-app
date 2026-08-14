-- =============================================
-- 마이그레이션: '쇼핑' → '쇼핑·미용' 이름 변경(+미용 소분류), 의료·건강에 보험 소분류 추가
--   ⚠️ Supabase 대시보드 → SQL Editor 에서 직접 실행하세요.
--   여러 번 실행해도 안전하며, 기존 데이터는 보존됩니다.
-- =============================================

-- 1) 상위 카테고리 '쇼핑' → '쇼핑·미용' 이름 변경
UPDATE public.categories
   SET name = '쇼핑·미용'
 WHERE name = '쇼핑' AND parent IS NULL;

-- 2) 기존 '쇼핑' 하위 소분류들의 parent 도 함께 변경
UPDATE public.categories
   SET parent = '쇼핑·미용'
 WHERE parent = '쇼핑';

-- 3) 기존 거래(내역)의 카테고리명도 이관 (색상·통계 유지)
UPDATE public.transactions
   SET category = '쇼핑·미용'
 WHERE category = '쇼핑';

-- 4) '미용' 소분류 추가 (쇼핑·미용 하위) — 없을 때만
INSERT INTO public.categories (type, name, parent, is_active, sort_order)
SELECT 'expense', '미용', '쇼핑·미용', true, 3
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name = '미용' AND parent = '쇼핑·미용'
);

-- 5) '보험' 소분류 추가 (의료·건강 하위) — 없을 때만
INSERT INTO public.categories (type, name, parent, is_active, sort_order)
SELECT 'expense', '보험', '의료·건강', true, 3
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name = '보험' AND parent = '의료·건강'
);
