-- =============================================
-- STEP 4: 주간리포트 (weekly_reports)
-- 여러 번 실행해도 안전합니다.
-- =============================================

CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  data       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wr_select" ON public.weekly_reports;
DROP POLICY IF EXISTS "wr_insert" ON public.weekly_reports;
DROP POLICY IF EXISTS "wr_update" ON public.weekly_reports;
DROP POLICY IF EXISTS "wr_delete" ON public.weekly_reports;

CREATE POLICY "wr_select" ON public.weekly_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wr_insert" ON public.weekly_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wr_update" ON public.weekly_reports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "wr_delete" ON public.weekly_reports FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wr_user_week ON public.weekly_reports(user_id, week_start);
