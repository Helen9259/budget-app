-- =============================================
-- STEP 6: 지출수단 (payment_methods)
-- 여러 번 실행해도 안전합니다.
-- =============================================

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_select" ON public.payment_methods;
DROP POLICY IF EXISTS "pm_insert" ON public.payment_methods;
DROP POLICY IF EXISTS "pm_update" ON public.payment_methods;
DROP POLICY IF EXISTS "pm_delete" ON public.payment_methods;

CREATE POLICY "pm_select" ON public.payment_methods FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pm_insert" ON public.payment_methods FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pm_update" ON public.payment_methods FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pm_delete" ON public.payment_methods FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_pm_user ON public.payment_methods(user_id, order_index);
