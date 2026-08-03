-- =============================================
-- 마이그레이션: 고정지출 자동생성 거래 중복 제거 + 재발 방지
--   ⚠️ Supabase 대시보드 → SQL Editor 에서 직접 실행하세요.
--   여러 번 실행해도 안전하며, 기존(정상) 데이터는 보존됩니다.
-- =============================================
--
-- [배경] 앱 시작과 가계부 탭 진입이 거의 동시에 자동생성 API를 호출하면,
--   서버리스에서 두 요청이 병렬로 "존재 확인 → 삽입"을 수행해 같은
--   (fixed_expense_id, date) 거래가 2건 생기는 경쟁 조건이 있었습니다.
--   → 아래에서 기존 중복을 정리하고, DB 레벨 unique 제약으로 원천 차단합니다.
-- =============================================

-- 1) 기존 중복 삭제: 같은 (fixed_expense_id, date) 는 가장 먼저 생성된 1건만 남김
DELETE FROM public.transactions t
USING public.transactions d
WHERE t.fixed_expense_id IS NOT NULL
  AND t.fixed_expense_id = d.fixed_expense_id
  AND t.date = d.date
  AND (t.created_at > d.created_at
       OR (t.created_at = d.created_at AND t.id > d.id));

-- 2) 재발 방지: (fixed_expense_id, date) 조합에 부분 unique 인덱스
--    fixed_expense_id 가 있는(자동생성) 거래만 대상. 수동 입력 거래는 영향 없음.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_fixed_expense_date
  ON public.transactions (fixed_expense_id, date)
  WHERE fixed_expense_id IS NOT NULL;
