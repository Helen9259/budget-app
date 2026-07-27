// /api/loans — 대출 조회/일괄 저장
const { makeApp, supabase, requireAppToken } = require('../lib/common');

const app = makeApp();

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

module.exports = app;
