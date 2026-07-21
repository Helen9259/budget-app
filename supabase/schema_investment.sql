-- =============================================
-- 투자 일지 (Investment Journal) 스키마
-- 가계부와 같은 Supabase 프로젝트에 테이블만 추가합니다.
-- 여러 번 실행해도 안전합니다.
--
-- 참고: 이 앱은 service_role 키로만 접근하는 단일 사용자 구조라
--   가계부 테이블과 달리 user_id 컬럼을 두지 않습니다.
--   RLS는 켜두되 정책을 만들지 않아 anon/authenticated 접근을 차단하고,
--   service_role(서버)만 접근하도록 합니다.
-- =============================================

-- =============================================
-- 1. 계좌 (inv_accounts)
--   ISA / 연금저축 / 일반계좌 등
--   account_group: 도넛 차트 계좌군 구분 ('tax' = 세제혜택(ISA·연금), 'general' = 일반)
-- =============================================
CREATE TABLE IF NOT EXISTS public.inv_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  account_group TEXT NOT NULL DEFAULT 'general' CHECK (account_group IN ('tax', 'general')),
  color         TEXT,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 2. 보유 종목 / 적립식 설정 (inv_holdings)
--   계좌별 종목 포지션. 도넛 드릴다운과 정기(DCA) 캐러셀 카드의 원천.
--   opening_amount: 최초 1회 수동 입력한 기준 누적 투자금 (이후 trades로 자동 가산)
--   is_recurring:   홈 캐러셀에 '이번 주 매수 확인' 카드로 노출할지
--   dca_quantity / dca_price: 정기 매수 기본 수량·단가
-- =============================================
CREATE TABLE IF NOT EXISTS public.inv_holdings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.inv_accounts(id) ON DELETE CASCADE,
  symbol         TEXT NOT NULL,
  opening_amount BIGINT NOT NULL DEFAULT 0,
  is_recurring   BOOLEAN NOT NULL DEFAULT FALSE,
  dca_quantity   NUMERIC,
  dca_price      BIGINT,
  sort_order     INT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, symbol)
);

-- =============================================
-- 3. 매매 기록 (inv_trades)
--   정기(확인) 기록과 상시(특이사항) 기록을 모두 저장.
--   trade_type:  buy(매수) / sell(매도) / stop_loss(손절)
--   emotion:     calm(편안) / neutral(보통) / anxious(불안)
--   record_type: regular(정기) / adhoc(상시)
--   plan_followed:   정기 기록의 계획 준수 O/X
--   stop_loss_check: 상시 기록의 손절 기준 준수 여부
-- =============================================
CREATE TABLE IF NOT EXISTS public.inv_trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.inv_accounts(id) ON DELETE CASCADE,
  holding_id      UUID REFERENCES public.inv_holdings(id) ON DELETE SET NULL,
  symbol          TEXT NOT NULL,
  trade_type      TEXT NOT NULL DEFAULT 'buy' CHECK (trade_type IN ('buy', 'sell', 'stop_loss')),
  date            DATE NOT NULL,
  quantity        NUMERIC,
  price           BIGINT,
  amount          BIGINT NOT NULL DEFAULT 0,
  reason          TEXT,
  emotion         TEXT CHECK (emotion IS NULL OR emotion IN ('calm', 'neutral', 'anxious')),
  record_type     TEXT NOT NULL DEFAULT 'adhoc' CHECK (record_type IN ('regular', 'adhoc')),
  plan_followed   BOOLEAN,
  stop_loss_check BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 4. Row Level Security (정책 없음 → service_role 전용)
-- =============================================
ALTER TABLE public.inv_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_trades   ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 5. 인덱스
-- =============================================
CREATE INDEX IF NOT EXISTS idx_inv_holdings_account ON public.inv_holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_inv_trades_date      ON public.inv_trades(date);
CREATE INDEX IF NOT EXISTS idx_inv_trades_account   ON public.inv_trades(account_id);
CREATE INDEX IF NOT EXISTS idx_inv_trades_holding   ON public.inv_trades(holding_id);
