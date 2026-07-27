// /api/inv/* — 투자 일지(Investment Journal) API
const { makeApp, supabase, requireAppToken } = require('../lib/common');

const app = makeApp();

const INV_GROUPS = {
  tax:     { label: 'ISA·연금',  color: '#2b3a8f' },
  general: { label: '일반계좌',  color: '#9a5b12' },
};

// /investment (트레일링 슬래시 없이 접근 시) → 앱으로 (로컬 서버용, Vercel은 vercel.json에서 처리)
app.get('/investment', (req, res) => res.redirect('/investment/'));

// ---- 계좌 ----
app.get('/api/inv/accounts', requireAppToken, async (req, res) => {
  const { data, error } = await supabase
    .from('inv_accounts').select('*')
    .order('sort_order').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/inv/accounts', requireAppToken, async (req, res) => {
  const { name, account_group, color, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: '계좌명을 입력하세요.' });
  const group = account_group === 'tax' ? 'tax' : 'general';
  const { data, error } = await supabase
    .from('inv_accounts')
    .insert([{ name, account_group: group, color: color || null, sort_order: sort_order || 0 }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/inv/accounts/:id', requireAppToken, async (req, res) => {
  const { name, account_group, color, sort_order } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (account_group !== undefined) update.account_group = account_group === 'tax' ? 'tax' : 'general';
  if (color !== undefined) update.color = color;
  if (sort_order !== undefined) update.sort_order = sort_order;
  const { data, error } = await supabase
    .from('inv_accounts').update(update).eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '계좌를 찾을 수 없습니다.' });
  res.json(data);
});

app.delete('/api/inv/accounts/:id', requireAppToken, async (req, res) => {
  const { error } = await supabase.from('inv_accounts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제되었습니다.' });
});

// 기본 계좌 시드 (계좌가 하나도 없을 때만)
app.post('/api/inv/seed', requireAppToken, async (req, res) => {
  const { count } = await supabase
    .from('inv_accounts').select('*', { count: 'exact', head: true });
  if (count > 0) return res.json({ seeded: false, count });
  const rows = [
    { name: 'ISA',      account_group: 'tax',     color: '#2b3a8f', sort_order: 0 },
    { name: '연금저축', account_group: 'tax',     color: '#3f51b5', sort_order: 1 },
    { name: '일반계좌', account_group: 'general', color: '#9a5b12', sort_order: 2 },
  ];
  const { data, error } = await supabase.from('inv_accounts').insert(rows).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ seeded: true, accounts: data });
});

// ---- 보유 종목 / 적립식 설정 ----
app.get('/api/inv/holdings', requireAppToken, async (req, res) => {
  const { data, error } = await supabase
    .from('inv_holdings')
    .select('*, inv_accounts(id, name, account_group, color)')
    .eq('is_active', true)
    .order('sort_order').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/inv/holdings', requireAppToken, async (req, res) => {
  const { account_id, symbol, opening_amount, is_recurring, dca_quantity, dca_price, sort_order } = req.body;
  if (!account_id || !symbol) return res.status(400).json({ error: '계좌와 종목명을 입력하세요.' });
  const row = {
    account_id, symbol,
    opening_amount: parseInt(String(opening_amount || 0).replace(/,/g, '')) || 0,
    is_recurring: !!is_recurring,
    dca_quantity: dca_quantity != null && dca_quantity !== '' ? parseFloat(dca_quantity) : null,
    dca_price: dca_price != null && dca_price !== '' ? parseInt(String(dca_price).replace(/,/g, '')) : null,
    sort_order: sort_order || 0,
    is_active: true,
  };
  const { data, error } = await supabase
    .from('inv_holdings')
    .upsert(row, { onConflict: 'account_id,symbol' })
    .select('*, inv_accounts(id, name, account_group, color)').single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/inv/holdings/:id', requireAppToken, async (req, res) => {
  const { symbol, opening_amount, is_recurring, dca_quantity, dca_price, sort_order } = req.body;
  const update = {};
  if (symbol !== undefined) update.symbol = symbol;
  if (opening_amount !== undefined) update.opening_amount = parseInt(String(opening_amount).replace(/,/g, '')) || 0;
  if (is_recurring !== undefined) update.is_recurring = !!is_recurring;
  if (dca_quantity !== undefined) update.dca_quantity = dca_quantity === '' || dca_quantity == null ? null : parseFloat(dca_quantity);
  if (dca_price !== undefined) update.dca_price = dca_price === '' || dca_price == null ? null : parseInt(String(dca_price).replace(/,/g, ''));
  if (sort_order !== undefined) update.sort_order = sort_order;
  const { data, error } = await supabase
    .from('inv_holdings').update(update).eq('id', req.params.id)
    .select('*, inv_accounts(id, name, account_group, color)').single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '종목을 찾을 수 없습니다.' });
  res.json(data);
});

app.delete('/api/inv/holdings/:id', requireAppToken, async (req, res) => {
  const { error } = await supabase
    .from('inv_holdings').update({ is_active: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제되었습니다.' });
});

// ---- 홈 오버뷰 (도넛 + 드릴다운 + 정기 캐러셀) ----
app.get('/api/inv/overview', requireAppToken, async (req, res) => {
  const [{ data: accounts, error: aErr }, { data: holdings, error: hErr }, { data: trades, error: tErr }] =
    await Promise.all([
      supabase.from('inv_accounts').select('*').order('sort_order'),
      supabase.from('inv_holdings').select('*').eq('is_active', true).order('sort_order').order('created_at'),
      supabase.from('inv_trades').select('account_id, symbol, trade_type, amount'),
    ]);
  if (aErr || hErr || tErr)
    return res.status(500).json({ error: (aErr || hErr || tErr).message });

  const acctById = {};
  (accounts || []).forEach(a => { acctById[a.id] = a; });

  const cum = {};
  const keyOf = (aid, sym) => `${aid}|||${sym}`;
  (holdings || []).forEach(h => {
    cum[keyOf(h.account_id, h.symbol)] = {
      account_id: h.account_id, symbol: h.symbol, amount: h.opening_amount || 0,
    };
  });
  (trades || []).forEach(t => {
    const k = keyOf(t.account_id, t.symbol);
    if (!cum[k]) cum[k] = { account_id: t.account_id, symbol: t.symbol, amount: 0 };
    const sign = t.trade_type === 'buy' ? 1 : -1;
    cum[k].amount += sign * (t.amount || 0);
  });

  const groupMap = {};
  Object.values(cum).forEach(entry => {
    const acct = acctById[entry.account_id];
    if (!acct) return;
    const g = acct.account_group || 'general';
    if (!groupMap[g]) groupMap[g] = { amount: 0, symbols: [] };
    groupMap[g].amount += entry.amount;
    if (entry.amount !== 0)
      groupMap[g].symbols.push({ symbol: entry.symbol, account: acct.name, amount: entry.amount });
  });

  const total = Object.values(groupMap).reduce((s, g) => s + g.amount, 0);
  const groups = Object.keys(INV_GROUPS)
    .filter(g => groupMap[g])
    .map(g => ({
      key: g,
      label: INV_GROUPS[g].label,
      color: INV_GROUPS[g].color,
      amount: groupMap[g].amount,
      pct: total > 0 ? Math.round(groupMap[g].amount / total * 100) : 0,
      symbols: groupMap[g].symbols.sort((a, b) => b.amount - a.amount),
    }));

  const recurring = (holdings || [])
    .filter(h => h.is_recurring)
    .map(h => {
      const acct = acctById[h.account_id] || {};
      return {
        holding_id: h.id,
        account_id: h.account_id,
        account: acct.name || '',
        account_group: acct.account_group || 'general',
        symbol: h.symbol,
        quantity: h.dca_quantity,
        price: h.dca_price,
      };
    });

  res.json({ total, groups, recurring });
});

// ---- 매매 기록 ----
app.post('/api/inv/trades', requireAppToken, async (req, res) => {
  let { account_id, holding_id, symbol, trade_type, date, quantity, price, amount,
        reason, emotion, record_type, plan_followed, stop_loss_check } = req.body;

  record_type = record_type === 'regular' ? 'regular' : 'adhoc';
  trade_type = ['buy', 'sell', 'stop_loss'].includes(trade_type) ? trade_type : 'buy';
  if (!account_id || !symbol) return res.status(400).json({ error: '계좌와 종목명을 입력하세요.' });
  date = date || new Date().toISOString().slice(0, 10);

  const qty = quantity != null && quantity !== '' ? parseFloat(quantity) : null;
  const prc = price != null && price !== '' ? parseInt(String(price).replace(/,/g, '')) : null;
  let amt = amount != null && amount !== '' ? parseInt(String(amount).replace(/,/g, '')) : null;
  if (amt == null) amt = (qty != null && prc != null) ? Math.round(qty * prc) : 0;

  if (emotion && !['calm', 'neutral', 'anxious'].includes(emotion)) emotion = null;

  if (record_type === 'adhoc') {
    if (!reason || !String(reason).trim())
      return res.status(400).json({ error: '매매 이유는 필수입니다.' });
    if (!emotion)
      return res.status(400).json({ error: '감정 태그는 필수입니다.' });
  }

  if (!holding_id) {
    const { data: h } = await supabase
      .from('inv_holdings').select('id')
      .eq('account_id', account_id).eq('symbol', symbol).maybeSingle();
    if (h) holding_id = h.id;
  }

  const { data, error } = await supabase
    .from('inv_trades')
    .insert([{
      account_id, holding_id: holding_id || null, symbol, trade_type, date,
      quantity: qty, price: prc, amount: amt,
      reason: reason || null, emotion: emotion || null, record_type,
      plan_followed: plan_followed == null ? null : !!plan_followed,
      stop_loss_check: stop_loss_check == null ? null : !!stop_loss_check,
    }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.get('/api/inv/trades', requireAppToken, async (req, res) => {
  const { year, month } = req.query;
  let query = supabase
    .from('inv_trades')
    .select('*, inv_accounts(name, account_group)');
  if (year && month) {
    const pad = n => String(n).padStart(2, '0');
    const startDate = `${year}-${pad(month)}-01`;
    const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];
    query = query.gte('date', startDate).lte('date', endDate);
  }
  query = query.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.delete('/api/inv/trades/:id', requireAppToken, async (req, res) => {
  const { error } = await supabase.from('inv_trades').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제되었습니다.' });
});

// ---- 이달의 인사이트 ----
app.get('/api/inv/insights', requireAppToken, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year, month 필요' });
  const pad = n => String(n).padStart(2, '0');
  const startDate = `${year}-${pad(month)}-01`;
  const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('inv_trades').select('emotion, record_type, plan_followed')
    .gte('date', startDate).lte('date', endDate);
  if (error) return res.status(500).json({ error: error.message });

  const rows = data || [];
  const anxiousCount = rows.filter(t => t.emotion === 'anxious').length;
  const adhocPlanned = rows.filter(t => t.record_type === 'regular' && t.plan_followed === true).length;
  res.json({
    total: rows.length,
    anxious_count: anxiousCount,
    plan_followed_count: adhocPlanned,
    regular_count: rows.filter(t => t.record_type === 'regular').length,
    adhoc_count: rows.filter(t => t.record_type === 'adhoc').length,
  });
});

module.exports = app;
