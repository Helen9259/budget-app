// /api/payment-methods/* — 지출수단 CRUD + 시드
const { makeApp, supabase, requireAppToken } = require('../lib/common');

const app = makeApp();

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

module.exports = app;
