-- =============================================
-- STEP 10: Supabase Auth 제거 — user_id nullable + RLS 비활성화
-- 여러 번 실행해도 안전합니다.
-- =============================================

-- user_id FK 제약 및 NOT NULL 제거
ALTER TABLE public.transactions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.categories
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.credit_cards
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.fixed_expenses
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.payment_methods
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.asset_snapshots
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.loans
  ALTER COLUMN user_id DROP NOT NULL;

-- RLS 비활성화 (service_role key로 bypass 가능하나 명시적으로 끔)
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans DISABLE ROW LEVEL SECURITY;
