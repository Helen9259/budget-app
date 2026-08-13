// /api/fixed-expenses/* — 고정지출 CRUD + 자동 생성
const { makeApp, supabase, requireAppToken, addMonths } = require('../lib/common');

const app = makeApp();

app.post('/api/fixed-expenses/generate', requireAppToken, async (req, res) => {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: fes, error } = await supabase
    .from('fixed_expenses').select('*')
    .eq('is_active', true);
  if (error) return res.status(500).json({ error: error.message });

  let generated = 0;

  for (const fe of fes) {
    const effectiveEndMonth = fe.end_month || null;

    const startMonth = fe.last_generated_month
      ? addMonths(fe.last_generated_month, 1)
      : (fe.created_month || currentMonth);

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

    // 생성 대상 월 → 날짜 매핑
    const monthDate = {};
    monthsToGen.forEach(month => {
      const [y, mo] = month.split('-').map(Number);
      const lastDay = new Date(y, mo, 0).getDate();
      const day = Math.min(fe.day_of_month, lastDay);
      monthDate[month] = `${month}-${String(day).padStart(2, '0')}`;
    });
    const dateList = Object.values(monthDate);

    // 존재 여부 일괄 조회 (기존 per-month maybeSingle → 2쿼리로 축소).
    // 두 판별 경로 모두 유지: (1) fixed_expense_id 일치, (2) content+is_fixed 폴백(레거시).
    // content 는 특수문자(콤마·괄호 등) 위험이 있어 or() 대신 별도 eq 쿼리로 분리.
    const [{ data: byIdRows }, { data: byContentRows }] = await Promise.all([
      supabase.from('transactions').select('date').eq('fixed_expense_id', fe.id).in('date', dateList),
      supabase.from('transactions').select('date').eq('content', fe.name).eq('is_fixed', true).in('date', dateList),
    ]);
    const existingDates = new Set([...(byIdRows || []), ...(byContentRows || [])].map(r => r.date));

    for (const month of monthsToGen) {
      const date = monthDate[month];
      if (existingDates.has(date)) { lastConfirmedMonth = month; continue; }

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
      if (!insErr) { generated++; lastConfirmedMonth = month; existingDates.add(date); }
      else if (insErr.code === '23505') { lastConfirmedMonth = month; } // unique 위반 = 동시 요청이 이미 삽입 → 존재로 간주하고 계속
      else break;
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

module.exports = app;
