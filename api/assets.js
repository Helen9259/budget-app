// /api/assets/* — 자산 스냅샷/추이
const { makeApp, supabase, requireAppToken } = require('../lib/common');

const app = makeApp();

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

  if (items.length === 0) {
    const { error } = await supabase.from('asset_snapshots')
      .delete().eq('year_month', year_month);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ saved: 0 });
  }

  // 기존 행 id 확보 → 새 행 삽입 성공 후에만 기존 행 삭제 (삽입 실패 시 데이터 보존)
  const { data: oldRows, error: selErr } = await supabase
    .from('asset_snapshots').select('id').eq('year_month', year_month);
  if (selErr) return res.status(500).json({ error: selErr.message });

  const rows = items.map(item => {
    const isInvest = item.type === 'investment';
    const subtype = isInvest ? (item.invest_subtype || (item.name === '기타' ? 'etc' : 'stock')) : null;
    // 수량·수익률은 개별주식/ETF/코인 에서만, 만기일·이자율은 채권 에서만 유효
    const rateEligible = subtype === 'stock' || subtype === 'etf' || subtype === 'coin';
    const isBond = subtype === 'bond';
    return {
      year_month,
      type: item.type,
      name: item.name,
      amount: parseInt(item.amount) || 0,
      invest_subtype: subtype,
      quantity: rateEligible && item.quantity != null && item.quantity !== '' ? parseFloat(item.quantity) : null,
      return_rate: rateEligible && item.return_rate != null && item.return_rate !== '' ? parseFloat(item.return_rate) : null,
      maturity_date: isBond && item.maturity_date ? item.maturity_date : null,
      interest_rate: isBond && item.interest_rate != null && item.interest_rate !== '' ? parseFloat(item.interest_rate) : null,
    };
  });
  const { error: insErr } = await supabase.from('asset_snapshots').insert(rows);
  if (insErr) return res.status(500).json({ error: insErr.message });

  if (oldRows && oldRows.length > 0) {
    const { error: delErr } = await supabase.from('asset_snapshots')
      .delete().in('id', oldRows.map(r => r.id));
    if (delErr) return res.status(500).json({ error: delErr.message });
  }
  res.json({ saved: rows.length });
});

module.exports = app;
