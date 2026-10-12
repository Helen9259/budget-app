-- =============================================
-- 마이그레이션: 지출수단 '서울페이' → '지역화폐' 이름 변경
--   ⚠️ Supabase 대시보드 → SQL Editor 에서 직접 실행하세요.
--   여러 번 실행해도 안전하며, 기존 데이터는 보존됩니다.
-- =============================================

-- 1) 지출수단 목록의 이름 변경
UPDATE public.payment_methods
   SET name = '지역화폐'
 WHERE name = '서울페이';

-- 2) 기존 거래에 저장된 지출수단 텍스트도 함께 변경
UPDATE public.transactions
   SET payment_method = '지역화폐'
 WHERE payment_method = '서울페이';
