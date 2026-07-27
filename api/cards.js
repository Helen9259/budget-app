// /api/credit-cards/* — 신용/체크카드 CRUD + 사용액
const { makeApp, supabase, requireAppToken } = require('../lib/common');

const app = makeApp();

app.get('/api/credit-cards/usage', requireAppToken, async (req, res) => {
  const { data: cards, error } = await supabase
    .from('credit_cards').select('*');
  if (error) return res.status(500).json({ error: error.message });

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const y = parseInt(req.query.year) || now.getFullYear();
  const m = parseInt(req.query.month) || now.getMonth() + 1;
  const results = [];

  for (const card of cards) {
    const start = `${y}-${pad(m)}-01`;
    const end = new Date(y, m, 0).toISOString().split('T')[0];

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

module.exports = app;
