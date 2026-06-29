-- =============================================
-- STEP 7: credit_cards 테이블 card_type 추가, payment_day nullable 처리
-- 여러 번 실행해도 안전합니다.
-- =============================================

-- card_type 컬럼 추가 (신용카드 기본값)
ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'credit'
  CHECK (card_type IN ('credit', 'debit'));

-- payment_day nullable 처리 (결제일 선택 항목으로)
ALTER TABLE public.credit_cards
  ALTER COLUMN payment_day DROP NOT NULL;

-- 기존 데이터: card_type = 'credit' 으로 세팅 (이미 DEFAULT로 처리됨)

-- payment_methods seed에서 신용카드+체크카드 → 카드로 통합
-- 기존 '신용카드', '체크카드' 항목을 '카드'로 교체 (이미 있는 사용자)
UPDATE public.payment_methods
  SET name = '카드', order_index = 0
  WHERE name = '신용카드';

DELETE FROM public.payment_methods
  WHERE name = '체크카드';
