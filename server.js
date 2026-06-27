require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase 클라이언트 (서비스 롤 — 서버 전용)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// =============================================
// JWT 미들웨어 — Supabase Access Token 검증
// =============================================
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }
  const token = auth.split(' ')[1];

  // Supabase anon 클라이언트로 토큰 검증
  const anonClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
  req.user = user;
  req.token = token;
  next();
}

// =============================================
// 인증 API (Supabase Auth 프록시)
// =============================================
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요.' });
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: '회원가입이 완료되었습니다.', user: { id: data.user.id, email: data.user.email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요.' });
  }
  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: { id: data.user.id, email: data.user.email },
  });
});

app.post('/api/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token이 필요합니다.' });
  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data, error } = await anonClient.auth.refreshSession({ refresh_token });
  if (error) return res.status(401).json({ error: error.message });
  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

// =============================================
// 거래 내역 API
// =============================================

// 목록 조회 (월별)
app.get('/api/transactions', requireAuth, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year, month 파라미터가 필요합니다.' });

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate   = new Date(year, month, 0).toISOString().split('T')[0]; // 말일

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.user.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 생성
app.post('/api/transactions', requireAuth, async (req, res) => {
  const { date, type, amount, content, category, subcategory, payment_method, credit_card_id, memo, is_fixed } = req.body;
  if (!date || !type || !amount || !content || !category) {
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
  }
  const { data, error } = await supabase
    .from('transactions')
    .insert([{ user_id: req.user.id, date, type, amount, content, category, subcategory, payment_method, credit_card_id, memo, is_fixed: !!is_fixed }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// 수정
app.put('/api/transactions/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { date, type, amount, content, category, subcategory, payment_method, credit_card_id, memo, is_fixed } = req.body;
  const { data, error } = await supabase
    .from('transactions')
    .update({ date, type, amount, content, category, subcategory, payment_method, credit_card_id, memo, is_fixed: !!is_fixed })
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
  res.json(data);
});

// 삭제
app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제되었습니다.' });
});

// CSV 내보내기
app.get('/api/transactions/export', requireAuth, async (req, res) => {
  const { year, month } = req.query;
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate   = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.user.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');

  if (error) return res.status(500).json({ error: error.message });

  const header = '날짜,구분,금액,내용,카테고리,소분류,지출수단,메모';
  const rows = data.map(t =>
    [t.date, t.type === 'income' ? '수입' : '지출', t.amount, `"${t.content}"`, t.category, t.subcategory || '', t.payment_method || '', `"${t.memo || ''}"`].join(',')
  );
  const csv = '﻿' + [header, ...rows].join('\n'); // BOM for Excel

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="budget_${year}${String(month).padStart(2,'0')}.csv"`);
  res.send(csv);
});

app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
