-- =============================================
-- 마이그레이션: 월 예산(budgets) 테이블
--   ⚠️ Supabase 대시보드 → SQL Editor 에서 직접 실행하세요.
--   여러 번 실행해도 안전합니다.
-- =============================================
--
--   category = '__total__' 행은 그 달의 전체 예산.
--   그 외 행은 카테고리별 한도.
-- =============================================

CREATE TABLE IF NOT EXISTS public.budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month   TEXT   NOT NULL,                 -- YYYY-MM
  category     TEXT   NOT NULL,                 -- '__total__' = 전체 예산
  limit_amount BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year_month, category)
);

-- service_role 전용 (앱은 service_role 키로만 접근)
ALTER TABLE public.budgets DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_budgets_ym ON public.budgets(year_month);
