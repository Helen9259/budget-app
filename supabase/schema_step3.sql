-- =============================================
-- STEP 3: 자산관리 (asset_snapshots + loans)
-- 여러 번 실행해도 안전합니다.
-- =============================================

-- =============================================
-- 1. asset_snapshots 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS public.asset_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month   TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('savings', 'investment', 'cash')),
  name         TEXT NOT NULL,
  amount       BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year_month, name)
);

ALTER TABLE public.asset_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "as_select" ON public.asset_snapshots;
DROP POLICY IF EXISTS "as_insert" ON public.asset_snapshots;
DROP POLICY IF EXISTS "as_update" ON public.asset_snapshots;
DROP POLICY IF EXISTS "as_delete" ON public.asset_snapshots;

CREATE POLICY "as_select" ON public.asset_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "as_insert" ON public.asset_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "as_update" ON public.asset_snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "as_delete" ON public.asset_snapshots FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- 2. loans 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS public.loans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  principal     BIGINT NOT NULL DEFAULT 0,
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ln_select" ON public.loans;
DROP POLICY IF EXISTS "ln_insert" ON public.loans;
DROP POLICY IF EXISTS "ln_update" ON public.loans;
DROP POLICY IF EXISTS "ln_delete" ON public.loans;

CREATE POLICY "ln_select" ON public.loans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ln_insert" ON public.loans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ln_update" ON public.loans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ln_delete" ON public.loans FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- 3. 인덱스
-- =============================================
CREATE INDEX IF NOT EXISTS idx_as_user_month ON public.asset_snapshots(user_id, year_month);
CREATE INDEX IF NOT EXISTS idx_ln_user       ON public.loans(user_id);
