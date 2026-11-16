// /api/budgets — 월 예산 조회/저장
//   각 행은 카테고리별 한도. 전체 예산은 프론트에서 카테고리 합계로 자동 계산한다.
//   (과거 '__total__' 행은 더 이상 쓰지 않으며, buildBudgetMap에서 무시된다.)
const { makeApp, supabase, requireAppToken } = require('../lib/common');

const app = makeApp();

app.get('/api/budgets', requireAppToken, async (req, res) => {
  const { year_month } = req.query;
  if (!year_month) return res.status(400).json({ error: 'year_month 필요' });
  const { data, error } = await supabase
    .from('budgets').select('*').eq('year_month', year_month);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.put('/api/budgets', requireAppToken, async (req, res) => {
  const { year_month, items } = req.body; // items: [{category, limit_amount}]
  if (!year_month || !Array.isArray(items))
    return res.status(400).json({ error: 'year_month, items 필요' });

  const rows = items
    .filter(it => it && it.category)
    .map(it => ({
      year_month,
      category: String(it.category),
      limit_amount: parseInt(String(it.limit_amount).replace(/,/g, '')) || 0,
    }));

  const positive = rows.filter(r => r.limit_amount > 0);
  const zeros = rows.filter(r => r.limit_amount <= 0).map(r => r.category);

  // 한도>0 는 upsert, 한도=0(해제)은 삭제 — 전체 삭제하지 않아 데이터 안전
  if (positive.length) {
    const { error } = await supabase
      .from('budgets').upsert(positive, { onConflict: 'year_month,category' });
    if (error) return res.status(500).json({ error: error.message });
  }
  if (zeros.length) {
    const { error } = await supabase
      .from('budgets').delete().eq('year_month', year_month).in('category', zeros);
    if (error) return res.status(500).json({ error: error.message });
  }
  res.json({ saved: positive.length, removed: zeros.length });
});

module.exports = app;
