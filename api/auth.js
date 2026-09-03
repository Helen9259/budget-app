// /api/auth/* — 비밀번호 인증
const { makeApp, APP_PASSWORD, SESSION_TOKEN } = require('../lib/common');

const app = makeApp();

app.post('/api/auth/verify', async (req, res) => {
  if (!APP_PASSWORD)
    return res.status(503).json({ error: '서버 인증이 설정되지 않았습니다 (APP_PASSWORD 누락).' });
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: '비밀번호를 입력하세요.' });
  if (password !== APP_PASSWORD)
    return res.status(401).json({ error: '비밀번호가 올바르지 않아요.' });
  res.json({ ok: true, token: SESSION_TOKEN });
});

module.exports = app;
