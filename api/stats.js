// /api/stats — 통계
const { makeApp, supabase, requireAppToken } = require('../lib/common');

const app = makeApp();

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

module.exports = app;
