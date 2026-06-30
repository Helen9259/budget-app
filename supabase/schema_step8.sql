-- =============================================
-- STEP 8: 성능 인덱스 확인
-- 여러 번 실행해도 안전합니다.
-- =============================================

-- transactions 테이블: (user_id, date) 복합 인덱스 (월별 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions(user_id, date);

-- asset_snapshots 테이블: (user_id, year_month) 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_as_user_month
  ON public.asset_snapshots(user_id, year_month);
