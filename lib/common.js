// =============================================
// 공통 모듈 — 서버리스 함수와 로컬 서버가 공유
// =============================================
try { require('dotenv').config(); } catch (_) {}

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// 로그인 비밀번호는 환경변수에서만 읽습니다 (하드코딩 금지)
const APP_PASSWORD = process.env.BUDGET_SECRET || process.env.APP_PASSWORD || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 환경변수 누락: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요');
}
if (!APP_PASSWORD) {
  console.error('❌ 환경변수 누락: APP_PASSWORD (또는 BUDGET_SECRET) 필요 — 로그인 불가');
}

// 서버리스 환경에서는 realtime(ws) 불필요 — REST만 사용
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 비밀번호 기반 세션 토큰 (HMAC — 재시작/재배포 후에도 동일한 값)
const SESSION_TOKEN = crypto
  .createHmac('sha256', APP_PASSWORD)
  .update('budget-app-session')
  .digest('hex');

// 인증 미들웨어
function requireAppToken(req, res, next) {
  // APP_PASSWORD 미설정 시 SESSION_TOKEN 은 공개 계산 가능한 상수가 되므로,
  // 이 경우 모든 요청을 거부해 인증 우회를 원천 차단한다.
  if (!APP_PASSWORD)
    return res.status(503).json({ error: '서버 인증이 설정되지 않았습니다 (APP_PASSWORD 누락).' });
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${SESSION_TOKEN}`)
    return res.status(401).json({ error: '인증이 필요합니다.' });
  next();
}

// YYYY-MM 월 문자열에 n개월 더하기
function addMonths(monthStr, n) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// json + cors 가 적용된 Express 앱 생성 (각 그룹 함수가 사용)
function makeApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' })); // CSV 대량 가져오기 등 큰 본문 허용 (기본 100kb → 초과 시 413)
  return app;
}

module.exports = {
  express, cors, supabase,
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_PASSWORD, SESSION_TOKEN,
  requireAppToken, addMonths, makeApp,
};
