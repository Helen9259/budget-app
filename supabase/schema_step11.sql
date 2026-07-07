-- =============================================
-- STEP 11: 고정지출 종료월 컬럼 추가
-- 여러 번 실행해도 안전합니다.
-- =============================================

-- fixed_expenses 테이블에 end_month 컬럼 추가 (nullable, YYYY-MM 형식)
ALTER TABLE public.fixed_expenses
  ADD COLUMN IF NOT EXISTS end_month TEXT;
