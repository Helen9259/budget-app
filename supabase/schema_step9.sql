-- =============================================
-- STEP 9: 고정지출 관련 컬럼 보장
-- 여러 번 실행해도 안전합니다.
-- =============================================

-- transactions 테이블에 고정지출 컬럼이 없으면 추가
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fixed_expense_id UUID REFERENCES public.fixed_expenses(id) ON DELETE SET NULL;

-- fixed_expenses 테이블에 tracking 컬럼이 없으면 추가
ALTER TABLE public.fixed_expenses
  ADD COLUMN IF NOT EXISTS last_generated_month TEXT;

ALTER TABLE public.fixed_expenses
  ADD COLUMN IF NOT EXISTS created_month TEXT;

-- created_month가 NULL인 기존 레코드를 현재 월로 채우기
UPDATE public.fixed_expenses
SET created_month = TO_CHAR(created_at, 'YYYY-MM')
WHERE created_month IS NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_tx_fixed_expense ON public.transactions(fixed_expense_id);
CREATE INDEX IF NOT EXISTS idx_fe_user_active ON public.fixed_expenses(user_id, is_active);
