// /api/transactions/* — 거래 내역 CRUD, 검색, CSV 내보내기
const { makeApp, supabase, requireAppToken } = require('../lib/common');

const app = makeApp();

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

// 검색 (/:id 보다 먼저 등록)
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

// CSV 가져오기 — 표준 포맷으로 파싱된 행들을 일괄 저장
app.post('/api/transactions/import', requireAppToken, async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: '가져올 데이터가 없습니다.' });
  if (rows.length > 5000)
    return res.status(400).json({ error: '한 번에 최대 5000건까지 가져올 수 있습니다.' });

  // 서버측 최종 검증 (클라이언트 검증을 신뢰하지 않음)
  const clean = [];
  for (const r of rows) {
    const date = String(r.date || '').trim();
    const type = r.type === 'income' ? 'income' : (r.type === 'expense' ? 'expense' : null);
    const amount = parseInt(r.amount, 10);
    const content = String(r.content || '').trim();
    const category = String(r.category || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !type || !Number.isFinite(amount) || amount <= 0 || !content || !category)
      continue; // 유효하지 않은 행은 건너뜀 (개수는 응답으로 알려줌)
    clean.push({
      date, type, amount, content, category,
      subcategory: r.subcategory ? String(r.subcategory).trim() : null,
      payment_method: r.payment_method ? String(r.payment_method).trim() : null,
      memo: r.memo ? String(r.memo).trim() : null,
      is_fixed: false,
      fixed_expense_id: null,
    });
  }
  if (clean.length === 0)
    return res.status(400).json({ error: '유효한 행이 없습니다. 열 형식을 확인해주세요.' });

  // 500건씩 나눠서 삽입 (서버리스 실행시간·페이로드 여유 확보)
  let inserted = 0;
  for (let i = 0; i < clean.length; i += 500) {
    const chunk = clean.slice(i, i + 500);
    const { error } = await supabase.from('transactions').insert(chunk);
    if (error) return res.status(500).json({ error: error.message, inserted });
    inserted += chunk.length;
  }
  res.json({ inserted, skipped: rows.length - inserted });
});

module.exports = app;
