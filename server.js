require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_PASSWORD = process.env.BUDGET_SECRET || process.env.APP_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 환경변수 누락: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}
console.log('[ENV] SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌');
console.log('[ENV] SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
console.log('[ENV] APP_PASSWORD:', APP_PASSWORD ? '✅' : '❌');
if (!APP_PASSWORD) {
  console.error('❌ 환경변수 누락: APP_PASSWORD 필요');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

// 비밀번호 기반 세션 토큰 (HMAC — 서버 재시작 후에도 동일한 값)
const SESSION_TOKEN = crypto
  .createHmac('sha256', APP_PASSWORD)
  .update('budget-app-session')
  .digest('hex');

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

// =============================================
// 인증 미들웨어 (단순 토큰 검증)
// =============================================
function requireAppToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${SESSION_TOKEN}`)
    return res.status(401).json({ error: '인증이 필요합니다.' });
  next();
}

// =============================================
// 인증 API
// =============================================
app.post('/api/auth/verify', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: '비밀번호를 입력하세요.' });
  if (password !== APP_PASSWORD)
    return res.status(401).json({ error: '비밀번호가 올바르지 않아요.' });
  res.json({ ok: true, token: SESSION_TOKEN });
});

// =============================================
// 거래 내역 API
// =============================================
app.get('/api/transactions', requireAppToken, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year, month 파라미터가 필요합니다.' });

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/transactions', requireAppToken, async (req, res) => {
  const { date, type, amount, content, category, subcategory, payment_method, credit_card_id, memo, is_fixed, fixed_expense_id } = req.body;
  if (!date || !type || !amount || !content || !category)
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });

  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      date, type, amount, content, category,
      subcategory, payment_method,
      credit_card_id: credit_card_id || null,
      memo, is_fixed: !!is_fixed,
      fixed_expense_id: fixed_expense_id || null,
    }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/transactions/:id', requireAppToken, async (req, res) => {
  const { date, type, amount, content, category, subcategory, payment_method, credit_card_id, memo, is_fixed } = req.body;
  const { data, error } = await supabase
    .from('transactions')
    .update({ date, type, amount, content, category, subcategory, payment_method, credit_card_id: credit_card_id || null, memo, is_fixed: !!is_fixed })
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
  res.json(data);
});

app.delete('/api/transactions/:id', requireAppToken, async (req, res) => {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제되었습니다.' });
});

// 통계 API
app.get('/api/stats', requireAppToken, async (req, res) => {
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
    supabase.from('transactions').select('*').eq('type', type).gte('date', startDate).lte('date', endDate),
    supabase.from('transactions').select('*').eq('type', type).gte('date', pStart).lte('date', pEnd),
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
app.get('/api/transactions/search', requireAppToken, async (req, res) => {
  const { q, date_from, date_to, category, payment, amount_min, amount_max } = req.query;
  let query = supabase.from('transactions').select('*');
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

app.get('/api/transactions/export', requireAppToken, async (req, res) => {
  const { data, error } = await supabase
    .from('transactions').select('*')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const today = new Date().toISOString().slice(0, 10);
  const header = '날짜,구분,금액,내용,카테고리,소분류,지출수단,메모';
  const rows = (data || []).map(t => {
    const esc = s => `"${String(s || '').replace(/"/g, '""')}"`;
    return [t.date, t.type === 'income' ? '수입' : '지출', t.amount,
      esc(t.content), t.category || '', t.subcategory || '',
      t.payment_method || '', esc(t.memo || '')].join(',');
  });
  const csv = '﻿' + [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="budget_all_${today}.csv"`);
  res.send(csv);
});

// =============================================
// 카테고리 API
// =============================================
const DEFAULT_CATEGORIES = [
  { type: 'expense', name: '식비',      icon: '🍽', color: '#FFB5A7', sort_order: 0,  subs: ['식료품','외식','카페·음료'] },
  { type: 'expense', name: '교통',      icon: '🚌', color: '#A8D8EA', sort_order: 1,  subs: ['대중교통','주유','주차'] },
  { type: 'expense', name: '주거',      icon: '🏠', color: '#C9B8E8', sort_order: 2,  subs: ['월세·관리비','전기·가스·수도','인터넷·통신'] },
  { type: 'expense', name: '쇼핑',      icon: '🛍', color: '#B5EAD7', sort_order: 3,  subs: ['의류','생활용품','온라인쇼핑'] },
  { type: 'expense', name: '의료·건강', icon: '💊', color: '#C7E8A0', sort_order: 4,  subs: ['병원','약국','헬스·운동'] },
  { type: 'expense', name: '문화·여가', icon: '🎬', color: '#FFDAC1', sort_order: 5,  subs: ['구독서비스','여행','취미'] },
  { type: 'expense', name: '교육',      icon: '📚', color: '#E2C4F0', sort_order: 6,  subs: ['학원','도서','강의'] },
  { type: 'expense', name: '경조사',    icon: '🎁', color: '#FFD6E0', sort_order: 7,  subs: ['축의금·조의금','선물'] },
  { type: 'excluded',name: '저축',      icon: '💰', color: '#b8e0d2', sort_order: 8,  subs: ['적금','비상금'] },
  { type: 'excluded',name: '투자',      icon: '📈', color: '#c8d8e4', sort_order: 9,  subs: ['주식·ETF','코인','펀드'] },
  { type: 'expense', name: '기타 지출', icon: '📦', color: '#D9D9D9', sort_order: 10, subs: [] },
  { type: 'income',  name: '근로소득',  icon: '💼', color: '#A0C4FF', sort_order: 0,  subs: ['월급','상여금','부수입'] },
  { type: 'income',  name: '금융소득',  icon: '🏦', color: '#B5D5FF', sort_order: 1,  subs: ['이자','배당'] },
  { type: 'income',  name: '기타 수입', icon: '🌱', color: '#D0E8FF', sort_order: 2,  subs: ['용돈','환급','판매'] },
];

app.post('/api/categories/seed', requireAppToken, async (req, res) => {
  const { count } = await supabase
    .from('categories').select('*', { count: 'exact', head: true });
  if (count > 0) return res.json({ seeded: false, count });

  const rows = [];
  DEFAULT_CATEGORIES.forEach(c => {
    rows.push({ type: c.type, name: c.name, icon: c.icon, color: c.color, sort_order: c.sort_order, is_active: true, parent: null });
    (c.subs || []).forEach((s, si) =>
      rows.push({ type: c.type, name: s, icon: null, color: null, sort_order: si, is_active: true, parent: c.name })
    );
  });
  const { error } = await supabase.from('categories').insert(rows);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ seeded: true });
});

app.get('/api/categories', requireAppToken, async (req, res) => {
  const { data, error } = await supabase
    .from('categories').select('*')
    .order('sort_order').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/categories', requireAppToken, async (req, res) => {
  const { type, name, parent, icon, color, sort_order } = req.body;
  if (!type || !name) return res.status(400).json({ error: 'type, name 필요' });
  const { data, error } = await supabase
    .from('categories')
    .insert([{ type, name, parent: parent || null, icon: icon || null, color: color || null, sort_order: sort_order || 0, is_active: true }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/categories/:id', requireAppToken, async (req, res) => {
  const { name, icon, color, is_active, sort_order } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (icon !== undefined) update.icon = icon;
  if (color !== undefined) update.color = color;
  if (is_active !== undefined) update.is_active = is_active;
  if (sort_order !== undefined) update.sort_order = sort_order;
  const { data, error } = await supabase
    .from('categories').update(update)
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
  res.json(data);
});

app.delete('/api/categories/:id', requireAppToken, async (req, res) => {
  const { error } = await supabase
    .from('categories').delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제됨' });
});

// =============================================
// 신용카드 API
// =============================================
app.get('/api/credit-cards/usage', requireAppToken, async (req, res) => {
  const { data: cards, error } = await supabase
    .from('credit_cards').select('*');
  if (error) return res.status(500).json({ error: error.message });

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const results = [];

  for (const card of cards) {
    const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data: txs } = await supabase
      .from('transactions').select('amount')
      .eq('credit_card_id', card.id)
      .eq('type', 'expense')
      .gte('date', start).lte('date', end);

    const used = (txs || []).reduce((s, t) => s + t.amount, 0);
    const limitAmt = card.limit_amount || 0;
    results.push({
      id: card.id, name: card.name,
      card_type: card.card_type || 'credit',
      limit_amount: limitAmt,
      color: card.color,
      used,
      remaining: limitAmt > 0 ? Math.max(0, limitAmt - used) : 0,
      cycle_start: start,
      cycle_end: end,
    });
  }
  res.json(results);
});

app.get('/api/credit-cards', requireAppToken, async (req, res) => {
  const { data, error } = await supabase
    .from('credit_cards').select('*').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/credit-cards', requireAppToken, async (req, res) => {
  const { name, card_type, limit_amount, color } = req.body;
  if (!name) return res.status(400).json({ error: '카드명을 입력하세요.' });
  const type = card_type === 'debit' ? 'debit' : 'credit';
  const { data, error } = await supabase
    .from('credit_cards')
    .insert([{
      name,
      card_type: type,
      limit_amount: parseInt(limit_amount) || 0,
      color: color || '#b39ddb',
    }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/credit-cards/:id', requireAppToken, async (req, res) => {
  const { name, card_type, limit_amount, color } = req.body;
  const type = card_type === 'debit' ? 'debit' : 'credit';
  const { data, error } = await supabase
    .from('credit_cards')
    .update({ name, card_type: type, limit_amount: parseInt(limit_amount) || 0, color })
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/credit-cards/:id', requireAppToken, async (req, res) => {
  const { error } = await supabase
    .from('credit_cards').delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제되었습니다.' });
});

// =============================================
// 고정지출 API
// =============================================
app.post('/api/fixed-expenses/generate', requireAppToken, async (req, res) => {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: fes, error } = await supabase
    .from('fixed_expenses').select('*')
    .eq('is_active', true);
  if (error) return res.status(500).json({ error: error.message });

  let generated = 0;

  for (const fe of fes) {
    // 종료월이 지났으면 생성 건너뜀
    const effectiveEndMonth = fe.end_month || null;

    // 생성 시작 월 결정: last_generated_month 다음 달, 없으면 created_month, 그것도 없으면 현재 월
    const startMonth = fe.last_generated_month
      ? addMonths(fe.last_generated_month, 1)
      : (fe.created_month || currentMonth);

    // 생성 상한: 현재 월과 종료월 중 이른 쪽
    const genUpTo = effectiveEndMonth && effectiveEndMonth < currentMonth
      ? effectiveEndMonth
      : currentMonth;

    if (startMonth > genUpTo) continue;

    const monthsToGen = [];
    let m = startMonth;
    while (m <= genUpTo) {
      monthsToGen.push(m);
      m = addMonths(m, 1);
    }

    let lastConfirmedMonth = fe.last_generated_month || null;

    for (const month of monthsToGen) {
      const [y, mo] = month.split('-').map(Number);
      const lastDay = new Date(y, mo, 0).getDate();
      const day = Math.min(fe.day_of_month, lastDay);
      const date = `${month}-${String(day).padStart(2, '0')}`;

      let existing = null;
      const { data: byId } = await supabase
        .from('transactions').select('id')
        .eq('fixed_expense_id', fe.id)
        .eq('date', date)
        .maybeSingle();
      if (byId) {
        existing = byId;
      } else {
        const { data: byContent } = await supabase
          .from('transactions').select('id')
          .eq('content', fe.name)
          .eq('date', date)
          .eq('is_fixed', true)
          .maybeSingle();
        existing = byContent;
      }

      if (!existing) {
        const { error: insErr } = await supabase.from('transactions').insert([{
          date,
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
        if (!insErr) { generated++; lastConfirmedMonth = month; }
        else break;
      } else {
        lastConfirmedMonth = month;
      }
    }

    if (lastConfirmedMonth && lastConfirmedMonth !== fe.last_generated_month) {
      await supabase.from('fixed_expenses')
        .update({ last_generated_month: lastConfirmedMonth })
        .eq('id', fe.id);
    }
  }

  res.json({ generated, currentMonth });
});

app.get('/api/fixed-expenses', requireAppToken, async (req, res) => {
  const { data, error } = await supabase
    .from('fixed_expenses')
    .select('*, credit_cards(id, name, color)')
    .eq('is_active', true)
    .order('end_month', { ascending: true, nullsFirst: false })
    .order('day_of_month');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/fixed-expenses', requireAppToken, async (req, res) => {
  const { day_of_month, name, amount, category, subcategory, payment_method, credit_card_id, end_month } = req.body;
  if (!day_of_month || !name || !amount || !category)
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });

  const now = new Date();
  const created_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('fixed_expenses')
    .insert([{
      day_of_month: parseInt(day_of_month),
      name,
      amount: parseInt(String(amount).replace(/,/g, '')),
      category, subcategory: subcategory || null,
      payment_method: payment_method || null,
      credit_card_id: credit_card_id || null,
      end_month: end_month || null,
      created_month,
      is_active: true,
    }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/fixed-expenses/:id', requireAppToken, async (req, res) => {
  const { day_of_month, name, amount, category, subcategory, payment_method, credit_card_id, end_month } = req.body;
  const { data, error } = await supabase
    .from('fixed_expenses')
    .update({
      day_of_month: parseInt(day_of_month),
      name,
      amount: parseInt(String(amount).replace(/,/g, '')),
      category, subcategory: subcategory || null,
      payment_method: payment_method || null,
      credit_card_id: credit_card_id || null,
      end_month: end_month || null,
    })
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/fixed-expenses/:id', requireAppToken, async (req, res) => {
  const { error } = await supabase
    .from('fixed_expenses')
    .update({ is_active: false })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제되었습니다.' });
});

// =============================================
// 자산 스냅샷 API
// =============================================
app.get('/api/assets/snapshot', requireAppToken, async (req, res) => {
  const { year_month } = req.query;
  if (!year_month) return res.status(400).json({ error: 'year_month 필요' });
  const { data, error } = await supabase
    .from('asset_snapshots').select('*')
    .eq('year_month', year_month)
    .order('type').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/assets/history', requireAppToken, async (req, res) => {
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const { data, error } = await supabase
    .from('asset_snapshots').select('*')
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

app.put('/api/assets/snapshot', requireAppToken, async (req, res) => {
  const { year_month, items } = req.body;
  if (!year_month || !Array.isArray(items))
    return res.status(400).json({ error: 'year_month, items 필요' });

  await supabase.from('asset_snapshots')
    .delete().eq('year_month', year_month);

  if (items.length === 0) return res.json({ saved: 0 });

  const rows = items.map(item => ({
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
// 지출수단 API
// =============================================
const DEFAULT_PAYMENT_METHODS = [
  { name: '카드',      order_index: 0, is_default: true },
  { name: '현금',      order_index: 1, is_default: true },
  { name: '카카오페이', order_index: 2, is_default: true },
  { name: '네이버페이', order_index: 3, is_default: true },
  { name: '토스',      order_index: 4, is_default: true },
  { name: '계좌이체',  order_index: 5, is_default: true },
  { name: '기타',      order_index: 6, is_default: true },
];

app.post('/api/payment-methods/seed', requireAppToken, async (req, res) => {
  const { count } = await supabase
    .from('payment_methods').select('*', { count: 'exact', head: true });
  if (count > 0) return res.json({ seeded: false, count });
  const { error } = await supabase.from('payment_methods').insert(DEFAULT_PAYMENT_METHODS);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ seeded: true });
});

app.get('/api/payment-methods', requireAppToken, async (req, res) => {
  const { data, error } = await supabase
    .from('payment_methods').select('*')
    .order('order_index').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/payment-methods', requireAppToken, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '이름을 입력하세요.' });
  const { count } = await supabase
    .from('payment_methods').select('*', { count: 'exact', head: true });
  const { data, error } = await supabase
    .from('payment_methods')
    .insert([{ name, order_index: count || 0, is_default: false }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/payment-methods/:id', requireAppToken, async (req, res) => {
  const { name, order_index } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (order_index !== undefined) update.order_index = order_index;
  const { data, error } = await supabase
    .from('payment_methods').update(update)
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '찾을 수 없습니다.' });
  res.json(data);
});

app.delete('/api/payment-methods/:id', requireAppToken, async (req, res) => {
  const { error } = await supabase
    .from('payment_methods').delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제됨' });
});

// =============================================
// 대출 API
// =============================================
app.get('/api/loans', requireAppToken, async (req, res) => {
  const { data, error } = await supabase
    .from('loans').select('*').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.put('/api/loans', requireAppToken, async (req, res) => {
  const { loans } = req.body;
  if (!Array.isArray(loans)) return res.status(400).json({ error: 'loans 배열 필요' });

  const { data: existing } = await supabase.from('loans').select('id');
  const keepIds = loans.filter(l => l.id).map(l => l.id);
  const deleteIds = (existing || []).map(l => l.id).filter(id => !keepIds.includes(id));

  if (deleteIds.length > 0)
    await supabase.from('loans').delete().in('id', deleteIds);

  for (const loan of loans) {
    const row = {
      name: loan.name,
      principal: parseInt(String(loan.principal || 0).replace(/,/g, '')) || 0,
      interest_rate: parseFloat(loan.interest_rate) || 0,
    };
    if (loan.id)
      await supabase.from('loans').update(row).eq('id', loan.id);
    else
      await supabase.from('loans').insert([row]);
  }

  const { data, error } = await supabase
    .from('loans').select('*').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// =============================================
// 주간리포트
// =============================================
app.get('/api/weekly-report', requireAppToken, async (req, res) => {
  const { week_start } = req.query;
  if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start))
    return res.status(400).json({ error: 'week_start(YYYY-MM-DD) 필요' });

  const monDate = new Date(week_start + 'T00:00:00');
  const sunDate = new Date(monDate);
  sunDate.setDate(monDate.getDate() + 6);
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const week_end = fmtDate(sunDate);

  const { data: txs, error } = await supabase
    .from('transactions').select('*')
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

  res.json({ week_start, week_end, days, categories, totalExpense, totalIncome });
});

app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
