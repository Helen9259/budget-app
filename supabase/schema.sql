-- =============================================
-- 가계부 + 자산관리 통합 앱 스키마
-- =============================================

-- =============================================
-- 1. 트랜잭션(가계부 내역) 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount       BIGINT NOT NULL CHECK (amount > 0),
  content      TEXT NOT NULL,
  category     TEXT NOT NULL,
  subcategory  TEXT,
  payment_method TEXT,   -- '신용카드','체크카드','현금','카카오페이','네이버페이','토스','계좌이체','기타'
  credit_card_id UUID,   -- 신용카드 선택 시 참조 (STEP 2에서 카드 테이블 추가)
  memo         TEXT,
  is_fixed     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 2. 카테고리 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS public.categories (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type      TEXT NOT NULL CHECK (type IN ('income', 'expense', 'excluded')),
  name      TEXT NOT NULL,
  parent    TEXT,         -- 소분류인 경우 대분류 이름
  icon      TEXT,
  color     TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 3. updated_at 자동 갱신 트리거
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_updated_at ON public.transactions;
CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- 4. Row Level Security
-- =============================================
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories   ENABLE ROW LEVEL SECURITY;

-- transactions RLS
CREATE POLICY "transactions_select" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions_update" ON public.transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "transactions_delete" ON public.transactions
  FOR DELETE USING (auth.uid() = user_id);

-- categories RLS
CREATE POLICY "categories_select" ON public.categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "categories_insert" ON public.categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "categories_update" ON public.categories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "categories_delete" ON public.categories
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- 5. 인덱스
-- =============================================
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_categories_user_type
  ON public.categories(user_id, type);
