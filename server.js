// =============================================
// 로컬 개발용 통합 서버
//   각 그룹의 서버리스 함수(Express 앱)를 그대로 mount 하여
//   Vercel 배포본과 동일한 라우트 로직을 로컬에서 구동합니다.
//   ── 프로덕션(Vercel)에서는 이 파일을 사용하지 않고
//      api/*.js 각 파일이 개별 서버리스 함수로 실행됩니다.
// =============================================
try { require('dotenv').config(); } catch (_) {}
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// 정적 파일 (public/) — 프론트엔드
app.use(express.static(path.join(__dirname, 'public')));

// /investment 트레일링 슬래시 리다이렉트 (Vercel은 vercel.json에서 처리)
app.get('/investment', (req, res) => res.redirect('/investment/'));

// 각 그룹 서버리스 함수(Express 앱)를 mount — 전부 /api/... 절대 경로
app.use(require('./api/auth'));
app.use(require('./api/transactions'));
app.use(require('./api/stats'));
app.use(require('./api/categories'));
app.use(require('./api/cards'));
app.use(require('./api/fixed-expenses'));
app.use(require('./api/assets'));
app.use(require('./api/payment-methods'));
app.use(require('./api/loans'));
app.use(require('./api/weekly-report'));
app.use(require('./api/inv'));

app.listen(PORT, () => console.log(`로컬 서버 실행 중: http://localhost:${PORT}`));
