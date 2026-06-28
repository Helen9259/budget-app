require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// =============================================
// 헬퍼 함수
// =============================================
function addMonths(monthStr, n) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getBillingCycle(paymentDay, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  const ld = (yr, mo) => new Date(yr, mo, 0).getDate();
  const cl = (yr, mo, dy) => Math.min(dy, ld(yr, mo));
  const pad = n => String(n).padStart(2, '0');

  const pd = cl(y, m, paymentDay);

  if (d <= pd) {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    const sd = cl(py, pm, paymentDay) + 1;
    const start = sd > ld(py, pm)
      ? `${y}-${pad(m)}-01`
      : `${py}-${pad(pm)}-${pad(sd)}`;
    return { start, end: `${y}-${pad(m)}-${pad(pd)}` };
  } else {
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    return {
      start: `${y}-${pad(m)}-${pad(pd + 1)}`,
      end: `${ny}-${pad(nm)}-${pad(cl(ny, nm, paymentDay))}`,
    };
  }
}

// =============================================
// JWT 미들웨어
// =============================================
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: '인증이 필요합니다.' });

  const token = auth.split(' ')[1];
  const anonClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user)
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });

  req.user = user;
  next();
}

// =============================================
// 인증 API
// =============================================
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요.' });

  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: '회원가입이 완료되었습니다.', user: { id: data.user.id, email: data.user.email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요.' });

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
  res.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});

// =============================================
// 거래 내역 API
// =============================================
app.get('/api/transactions', requireAuth, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year, month 파라미터가 필요합니다.' });

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

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

app.post('/api/transactions', requireAuth, async (req, res) => {
  const { date, type, amount, content, category, subcategory, payment_method, credit_card_id, memo, is_fixed, fixed_expense_id } = req.body;
  if (!date || !type || !amount || !content || !category)
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });

  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      user_id: req.user.id, date, type, amount, content, category,
      subcategory, payment_method,
      credit_card_id: credit_card_id || null,
      memo, is_fixed: !!is_fixed,
      fixed_expense_id: fixed_expense_id || null,
    }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/transactions/:id', requireAuth, async (req, res) => {
  const { date, type, amount, content, category, subcategory, payment_method, credit_card_id, memo, is_fixed } = req.body;
  const { data, error } = await supabase
    .from('transactions')
    .update({ date, type, amount, content, category, subcategory, payment_method, credit_card_id: credit_card_id || null, memo, is_fixed: !!is_fixed })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
  res.json(data);
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제되었습니다.' });
});

// 통계 API
app.get('/api/stats', requireAuth, async (req, res) => {
  const { year, month, type = 'expense' } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year, month 필요' });

  const pad = n => String(n).padStart(2, '0');
  const startDate = `${year}-${pad(month)}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  const pd = new Date(year, month - 2, 1);
  const py = pd.getFullYear(), pm = pd.getMonth() + 1;
  const pStart = `${py}-${pad(pm)}-01`;
  const pEnd = new Date(py, pm, 0).toISOString().split('T')[0];

  const [{ data: curr }, { data: prev }] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', req.user.id).eq('type', type).gte('date', startDate).lte('date', endDate),
    supabase.from('transactions').select('*').eq('user_id', req.user.id).eq('type', type).gte('date', pStart).lte('date', pEnd),
  ]);

  const EXCLUDED = ['저축', '투자'];
  const filter = type === 'expense' ? t => !EXCLUDED.includes(t.category) : () => true;
  const currF = (curr || []).filter(filter);
  const prevF = (prev || []).filter(filter);

  const catMap = {};
  currF.forEach(t => {
    if (!catMap[t.category]) catMap[t.category] = { total: 0, subs: {} };
    catMap[t.category].total += t.amount;
    const s = t.subcategory || '기타';
    catMap[t.category].subs[s] = (catMap[t.category].subs[s] || 0) + t.amount;
  });

  const prevCat = {};
  prevF.forEach(t => { prevCat[t.category] = (prevCat[t.category] || 0) + t.amount; });

  const total = currF.reduce((s, t) => s + t.amount, 0);
  const prevTotal = prevF.reduce((s, t) => s + t.amount, 0);

  const categories = Object.entries(catMap)
    .map(([name, d]) => ({
      name, total: d.total,
      pct: total > 0 ? Math.round(d.total / total * 100) : 0,
      prev_total: prevCat[name] || 0,
      subs: Object.entries(d.subs).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })),
    }))
    .sort((a, b) => b.total - a.total);

  res.json({ total, prev_total: prevTotal, categories });
});

// 검색 API (/:id보다 먼저)
app.get('/api/transactions/search', requireAuth, async (req, res) => {
  const { q, date_from, date_to, category, payment, amount_min, amount_max } = req.query;
  let query = supabase.from('transactions').select('*').eq('user_id', req.user.id);
  if (q) query = query.ilike('content', `%${q}%`);
  if (date_from) query = query.gte('date', date_from);
  if (date_to) query = query.lte('date', date_to);
  if (category) query = query.eq('category', category);
  if (payment) query = query.eq('payment_method', payment);
  if (amount_min) query = query.gte('amount', parseInt(amount_min));
  if (amount_max) query = query.lte('amount', parseInt(amount_max));
  query = query.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(300);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/transactions/export', requireAuth, async (req, res) => {
  const { year, month } = req.query;
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('transactions').select('*')
    .eq('user_id', req.user.id)
    .gte('date', startDate).lte('date', endDate).order('date');

  if (error) return res.status(500).json({ error: error.message });

  const header = '날짜,구분,금액,내용,카테고리,소분류,지출수단,메모';
  const rows = data.map(t =>
    [t.date, t.type === 'income' ? '수입' : '지출', t.amount, `"${t.content}"`,
      t.category, t.subcategory || '', t.payment_method || '', `"${t.memo || ''}"`].join(',')
  );
  const csv = '﻿' + [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="budget_${year}${String(month).padStart(2, '0')}.csv"`);
  res.send(csv);
});

// =============================================
// 신용카드 API
// =============================================

// 주의: /api/credit-cards/usage 는 /:id 보다 먼저 등록
app.get('/api/credit-cards/usage', requireAuth, async (req, res) => {
  const { data: cards, error } = await supabase
    .from('credit_cards').select('*').eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });

  const now = new Date();
  const results = [];

  for (const card of cards) {
    const { start, end } = getBillingCycle(card.payment_day, now);
    const { data: txs } = await supabase
      .from('transactions').select('amount')
      .eq('user_id', req.user.id)
      .eq('credit_card_id', card.id)
      .eq('type', 'expense')
      .gte('date', start).lte('date', end);

    const used = (txs || []).reduce((s, t) => s + t.amount, 0);
    results.push({
      id: card.id, name: card.name,
      limit_amount: card.limit_amount,
      payment_day: card.payment_day,
      color: card.color,
      used,
      remaining: Math.max(0, card.limit_amount - used),
      cycle_start: start,
      cycle_end: end,
    });
  }
  res.json(results);
});

app.get('/api/credit-cards', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('credit_cards').select('*').eq('user_id', req.user.id).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/credit-cards', requireAuth, async (req, res) => {
  const { name, limit_amount, payment_day, color } = req.body;
  if (!name) return res.status(400).json({ error: '카드명을 입력하세요.' });
  const { data, error } = await supabase
    .from('credit_cards')
    .insert([{
      user_id: req.user.id, name,
      limit_amount: parseInt(limit_amount) || 0,
      payment_day: parseInt(payment_day) || 25,
      color: color || '#b39ddb',
    }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/credit-cards/:id', requireAuth, async (req, res) => {
  const { name, limit_amount, payment_day, color } = req.body;
  const { data, error } = await supabase
    .from('credit_cards')
    .update({ name, limit_amount: parseInt(limit_amount) || 0, payment_day: parseInt(payment_day) || 25, color })
    .eq('id', req.params.id).eq('user_id', req.user.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/credit-cards/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('credit_cards').delete()
    .eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제되었습니다.' });
});

// =============================================
// 고정지출 API
// =============================================

// 주의: /generate 는 /:id 보다 먼저 등록
app.post('/api/fixed-expenses/generate', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: fes, error } = await supabase
    .from('fixed_expenses').select('*')
    .eq('user_id', userId).eq('is_active', true);
  if (error) return res.status(500).json({ error: error.message });

  let generated = 0;

  for (const fe of fes) {
    const startMonth = fe.last_generated_month
      ? addMonths(fe.last_generated_month, 1)
      : fe.created_month;

    if (startMonth > currentMonth) continue;

    const monthsToGen = [];
    let m = startMonth;
    while (m <= currentMonth) {
      monthsToGen.push(m);
      m = addMonths(m, 1);
    }

    for (const month of monthsToGen) {
      const [y, mo] = month.split('-').map(Number);
      const lastDay = new Date(y, mo, 0).getDate();
      const day = Math.min(fe.day_of_month, lastDay);
      const date = `${month}-${String(day).padStart(2, '0')}`;

      const { data: existing } = await supabase
        .from('transactions').select('id')
        .eq('user_id', userId)
        .eq('fixed_expense_id', fe.id)
        .eq('date', date)
        .maybeSingle();

      if (!existing) {
        const { error: insErr } = await supabase.from('transactions').insert([{
          user_id: userId, date,
          type: 'expense',
          amount: fe.amount,
          content: fe.name,
          category: fe.category,
          subcategory: fe.subcategory || null,
          payment_method: fe.payment_method || null,
          credit_card_id: fe.credit_card_id || null,
          is_fixed: true,
          fixed_expense_id: fe.id,
        }]);
        if (!insErr) generated++;
      }
    }

    await supabase.from('fixed_expenses')
      .update({ last_generated_month: currentMonth })
      .eq('id', fe.id);
  }

  res.json({ generated, currentMonth });
});

app.get('/api/fixed-expenses', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('fixed_expenses')
    .select('*, credit_cards(id, name, color)')
    .eq('user_id', req.user.id)
    .eq('is_active', true)
    .order('day_of_month');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/fixed-expenses', requireAuth, async (req, res) => {
  const { day_of_month, name, amount, category, subcategory, payment_method, credit_card_id } = req.body;
  if (!day_of_month || !name || !amount || !category)
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });

  const now = new Date();
  const created_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('fixed_expenses')
    .insert([{
      user_id: req.user.id,
      day_of_month: parseInt(day_of_month),
      name,
      amount: parseInt(String(amount).replace(/,/g, '')),
      category, subcategory: subcategory || null,
      payment_method: payment_method || null,
      credit_card_id: credit_card_id || null,
      created_month,
      is_active: true,
    }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/fixed-expenses/:id', requireAuth, async (req, res) => {
  const { day_of_month, name, amount, category, subcategory, payment_method, credit_card_id } = req.body;
  const { data, error } = await supabase
    .from('fixed_expenses')
    .update({
      day_of_month: parseInt(day_of_month),
      name,
      amount: parseInt(String(amount).replace(/,/g, '')),
      category, subcategory: subcategory || null,
      payment_method: payment_method || null,
      credit_card_id: credit_card_id || null,
    })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/fixed-expenses/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('fixed_expenses')
    .update({ is_active: false })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제되었습니다.' });
});

// =============================================
// 자산 스냅샷 API
// =============================================
app.get('/api/assets/snapshot', requireAuth, async (req, res) => {
  const { year_month } = req.query;
  if (!year_month) return res.status(400).json({ error: 'year_month 필요' });
  const { data, error } = await supabase
    .from('asset_snapshots').select('*')
    .eq('user_id', req.user.id).eq('year_month', year_month)
    .order('type').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/assets/history', requireAuth, async (req, res) => {
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const { data, error } = await supabase
    .from('asset_snapshots').select('*')
    .eq('user_id', req.user.id)
    .gte('year_month', months[0]).lte('year_month', months[months.length - 1]);
  if (error) return res.status(500).json({ error: error.message });

  const byMonth = {};
  (data || []).forEach(row => {
    if (!byMonth[row.year_month]) byMonth[row.year_month] = [];
    byMonth[row.year_month].push(row);
  });

  res.json(months.map(m => ({
    year_month: m,
    items: byMonth[m] || null,
    total: byMonth[m] ? byMonth[m].reduce((s, r) => s + r.amount, 0) : null,
  })));
});

app.put('/api/assets/snapshot', requireAuth, async (req, res) => {
  const { year_month, items } = req.body;
  if (!year_month || !Array.isArray(items))
    return res.status(400).json({ error: 'year_month, items 필요' });

  await supabase.from('asset_snapshots')
    .delete().eq('user_id', req.user.id).eq('year_month', year_month);

  if (items.length === 0) return res.json({ saved: 0 });

  const rows = items.map(item => ({
    user_id: req.user.id,
    year_month,
    type: item.type,
    name: item.name,
    amount: parseInt(item.amount) || 0,
  }));
  const { error } = await supabase.from('asset_snapshots').insert(rows);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ saved: rows.length });
});

// =============================================
// 대출 API
// =============================================
app.get('/api/loans', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('loans').select('*').eq('user_id', req.user.id).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.put('/api/loans', requireAuth, async (req, res) => {
  const { loans } = req.body;
  if (!Array.isArray(loans)) return res.status(400).json({ error: 'loans 배열 필요' });

  const { data: existing } = await supabase
    .from('loans').select('id').eq('user_id', req.user.id);
  const keepIds = loans.filter(l => l.id).map(l => l.id);
  const deleteIds = (existing || []).map(l => l.id).filter(id => !keepIds.includes(id));

  if (deleteIds.length > 0)
    await supabase.from('loans').delete().in('id', deleteIds);

  for (const loan of loans) {
    const row = {
      user_id: req.user.id,
      name: loan.name,
      principal: parseInt(String(loan.principal || 0).replace(/,/g, '')) || 0,
      interest_rate: parseFloat(loan.interest_rate) || 0,
    };
    if (loan.id)
      await supabase.from('loans').update(row).eq('id', loan.id).eq('user_id', req.user.id);
    else
      await supabase.from('loans').insert([row]);
  }

  const { data, error } = await supabase
    .from('loans').select('*').eq('user_id', req.user.id).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// =============================================
// 주간리포트
// =============================================
app.get('/api/weekly-report', requireAuth, async (req, res) => {
  const { week_start } = req.query;
  if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start))
    return res.status(400).json({ error: 'week_start(YYYY-MM-DD) 필요' });

  // 캐시 확인
  const { data: cached } = await supabase
    .from('weekly_reports').select('data')
    .eq('user_id', req.user.id).eq('week_start', week_start).maybeSingle();
  if (cached?.data) return res.json(cached.data);

  // 주간 날짜 범위 (월~일)
  const monDate = new Date(week_start + 'T00:00:00');
  const sunDate = new Date(monDate);
  sunDate.setDate(monDate.getDate() + 6);
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const week_end = fmtDate(sunDate);

  const { data: txs, error } = await supabase
    .from('transactions').select('*')
    .eq('user_id', req.user.id)
    .gte('date', week_start).lte('date', week_end)
    .order('date').order('created_at');
  if (error) return res.status(500).json({ error: error.message });

  const EXCLUDED = ['저축', '투자'];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monDate);
    d.setDate(monDate.getDate() + i);
    const ds = fmtDate(d);
    const dayTxs = (txs || []).filter(t => t.date === ds);
    const income = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = dayTxs.filter(t => t.type === 'expense' && !EXCLUDED.includes(t.category))
      .reduce((s, t) => s + t.amount, 0);
    days.push({ date: ds, transactions: dayTxs, income, expense });
  }

  // 카테고리별 합산 (저축/투자 제외)
  const catMap = {};
  (txs || []).forEach(t => {
    if (t.type !== 'expense' || EXCLUDED.includes(t.category)) return;
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  });
  const categories = Object.entries(catMap)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalExpense = categories.reduce((s, c) => s + c.amount, 0);
  const totalIncome = (txs || []).filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  const reportData = { week_start, week_end, days, categories, totalExpense, totalIncome };

  // DB 캐시 저장
  await supabase.from('weekly_reports').upsert(
    [{ user_id: req.user.id, week_start, data: reportData }],
    { onConflict: 'user_id,week_start' }
  );

  res.json(reportData);
});

app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
