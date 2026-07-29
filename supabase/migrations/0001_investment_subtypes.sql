-- =============================================
-- 마이그레이션: 투자 자산 세부 유형(invest_subtype) + 채권 필드
--   ⚠️ Supabase 대시보드 → SQL Editor 에서 직접 실행하세요.
--   여러 번 실행해도 안전합니다 (IF NOT EXISTS / 조건부 UPDATE).
--   기존 데이터는 보존됩니다.
-- =============================================
--
-- [설계 노트]
--   실제 asset_snapshots.type 은 CHECK (type IN ('savings','investment','cash'))
--   제약이 걸려 있고, 자산 도넛/순자산 추이/요약카드가 모두 type 값으로 투자를
--   하나로 묶어 집계합니다. 따라서 지시서 예시처럼 type 자체를 '개별주식' 등으로
--   바꾸면 (1) CHECK 제약 위반, (2) 도넛·추이의 "투자 통합" 요구 위반이 됩니다.
--   → type 은 'investment' 그대로 두고, 세부 유형은 새 컬럼 invest_subtype 으로
--     분리합니다. 이렇게 하면 도넛(3조각)·추이(3단)는 코드 변경 없이 유지되고,
--     입력 폼과 자산 구성 리스트(아코디언)에서만 세분화됩니다.
--
--   invest_subtype 값: 'stock'(개별주식) | 'etf' | 'coin' | 'bond'(채권) | 'etc'(기타)
-- =============================================

-- 1) 컬럼 추가 (투자 세부 유형 + 채권 전용 필드)
ALTER TABLE public.asset_snapshots
  ADD COLUMN IF NOT EXISTS invest_subtype TEXT,
  ADD COLUMN IF NOT EXISTS maturity_date  DATE,
  ADD COLUMN IF NOT EXISTS interest_rate  NUMERIC;

-- 2) 기존 투자 데이터 일괄 이관
--    기존 "주식·ETF·코인"(type='investment') 통합 데이터를 개별주식(stock)으로 이관.
--    단, name='기타' 항목은 기타(etc)로 분류.
--    (이미 invest_subtype 이 채워진 행은 건드리지 않음 → 재실행 안전)
UPDATE public.asset_snapshots
   SET invest_subtype = CASE WHEN name = '기타' THEN 'etc' ELSE 'stock' END
 WHERE type = 'investment'
   AND invest_subtype IS NULL;

-- 이후 사용자는 자산관리 화면에서 개별주식 → ETF/채권/코인 으로 하나씩
-- 수동 재분류합니다. (자동 재분류 로직은 없습니다.)
