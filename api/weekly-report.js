// /api/weekly-report — 주간 리포트
const { makeApp, supabase, requireAppToken } = require('../lib/common');

const app = makeApp();

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

module.exports = app;
