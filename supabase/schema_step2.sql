-- =============================================
-- STEP 2: 신용카드 & 고정지출 추가
-- schema.sql(STEP 1) 실행 후에만 실행하세요.
-- =============================================

-- =============================================
-- 1. transactions 테이블에 컬럼 추가
-- =============================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fixed_expense_id UUID;

-- =============================================
-- 2. 신용카드 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS public.credit_cards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  limit_amount BIGINT NOT NULL DEFAULT 0,
  payment_day  INT NOT NULL DEFAULT 25 CHECK (payment_day BETWEEN 1 AND 31),
  color        TEXT NOT NULL DEFAULT '#b39ddb',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_select" ON public.credit_cards
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cc_insert" ON public.credit_cards
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cc_update" ON public.credit_cards
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cc_delete" ON public.credit_cards
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- 3. 고정지출 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS public.fixed_expenses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_month         INT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  name                 TEXT NOT NULL,
  amount               BIGINT NOT NULL CHECK (amount > 0),
  category             TEXT NOT NULL,
  subcategory          TEXT,
  payment_method       TEXT,
  credit_card_id       UUID REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  last_generated_month TEXT,     -- 'YYYY-MM' 마지막 생성 월
  created_month        TEXT NOT NULL, -- 'YYYY-MM' 생성 시작 월
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fe_select" ON public.fixed_expenses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "fe_insert" ON public.fixed_expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fe_update" ON public.fixed_expenses
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "fe_delete" ON public.fixed_expenses
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- 4. 외래 키 (중복 실행 안전)
-- =============================================
DO $$ BEGIN
  ALTER TABLE public.transactions ADD CONSTRAINT fk_tx_credit_card
    FOREIGN KEY (credit_card_id) REFERENCES public.credit_cards(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.transactions ADD CONSTRAINT fk_tx_fixed_expense
    FOREIGN KEY (fixed_expense_id) REFERENCES public.fixed_expenses(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================
-- 5. 인덱스
-- =============================================
CREATE INDEX IF NOT EXISTS idx_cc_user
  ON public.credit_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_fe_user_active
  ON public.fixed_expenses(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tx_credit_card
  ON public.transactions(credit_card_id);
CREATE INDEX IF NOT EXISTS idx_tx_fixed_expense
  ON public.transactions(fixed_expense_id);
