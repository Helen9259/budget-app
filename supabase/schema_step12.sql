-- =============================================
-- STEP 12: 투자 자산 수량·수익률 컬럼 추가
-- 여러 번 실행해도 안전합니다.
-- =============================================

ALTER TABLE public.asset_snapshots
  ADD COLUMN IF NOT EXISTS quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS return_rate NUMERIC;
