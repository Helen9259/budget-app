// /api/categories/* — 카테고리 CRUD + 시드
const { makeApp, supabase, requireAppToken } = require('../lib/common');

const app = makeApp();

const DEFAULT_CATEGORIES = [
  { type: 'expense', name: '식비',      icon: '🍽', color: '#FFB5A7', sort_order: 0,  subs: ['식료품','외식','카페·음료'] },
  { type: 'expense', name: '교통',      icon: '🚌', color: '#A8D8EA', sort_order: 1,  subs: ['대중교통','주유','주차'] },
  { type: 'expense', name: '주거',      icon: '🏠', color: '#C9B8E8', sort_order: 2,  subs: ['월세·관리비','전기·가스·수도','인터넷·통신'] },
  { type: 'expense', name: '쇼핑',      icon: '🛍', color: '#B5EAD7', sort_order: 3,  subs: ['의류','생활용품','온라인쇼핑'] },
  { type: 'expense', name: '의료·건강', icon: '💊', color: '#C7E8A0', sort_order: 4,  subs: ['병원','약국','헬스·운동'] },
  { type: 'expense', name: '문화·여가', icon: '🎬', color: '#FFDAC1', sort_order: 5,  subs: ['구독서비스','여행','취미'] },
  { type: 'expense', name: '교육',      icon: '📚', color: '#E2C4F0', sort_order: 6,  subs: ['학원','도서','강의'] },
  { type: 'expense', name: '경조사',    icon: '🎁', color: '#FFD6E0', sort_order: 7,  subs: ['축의금·조의금','선물'] },
  { type: 'excluded',name: '저축',      icon: '💰', color: '#b8e0d2', sort_order: 8,  subs: ['적금','비상금'] },
  { type: 'excluded',name: '투자',      icon: '📈', color: '#c8d8e4', sort_order: 9,  subs: ['주식·ETF','코인','펀드'] },
  { type: 'expense', name: '기타 지출', icon: '📦', color: '#D9D9D9', sort_order: 10, subs: [] },
  { type: 'income',  name: '근로소득',  icon: '💼', color: '#A0C4FF', sort_order: 0,  subs: ['월급','상여금','부수입'] },
  { type: 'income',  name: '금융소득',  icon: '🏦', color: '#B5D5FF', sort_order: 1,  subs: ['이자','배당'] },
  { type: 'income',  name: '기타 수입', icon: '🌱', color: '#D0E8FF', sort_order: 2,  subs: ['용돈','환급','판매'] },
];

app.post('/api/categories/seed', requireAppToken, async (req, res) => {
  const { count } = await supabase
    .from('categories').select('*', { count: 'exact', head: true });
  if (count > 0) return res.json({ seeded: false, count });

  const rows = [];
  DEFAULT_CATEGORIES.forEach(c => {
    rows.push({ type: c.type, name: c.name, icon: c.icon, color: c.color, sort_order: c.sort_order, is_active: true, parent: null });
    (c.subs || []).forEach((s, si) =>
      rows.push({ type: c.type, name: s, icon: null, color: null, sort_order: si, is_active: true, parent: c.name })
    );
  });
  const { error } = await supabase.from('categories').insert(rows);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ seeded: true });
});

app.get('/api/categories', requireAppToken, async (req, res) => {
  const { data, error } = await supabase
    .from('categories').select('*')
    .order('sort_order').order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/categories', requireAppToken, async (req, res) => {
  const { type, name, parent, icon, color, sort_order } = req.body;
  if (!type || !name) return res.status(400).json({ error: 'type, name 필요' });
  const { data, error } = await supabase
    .from('categories')
    .insert([{ type, name, parent: parent || null, icon: icon || null, color: color || null, sort_order: sort_order || 0, is_active: true }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/categories/:id', requireAppToken, async (req, res) => {
  const { name, icon, color, is_active, sort_order } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (icon !== undefined) update.icon = icon;
  if (color !== undefined) update.color = color;
  if (is_active !== undefined) update.is_active = is_active;
  if (sort_order !== undefined) update.sort_order = sort_order;
  const { data, error } = await supabase
    .from('categories').update(update)
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
  res.json(data);
});

app.delete('/api/categories/:id', requireAppToken, async (req, res) => {
  const { error } = await supabase
    .from('categories').delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: '삭제됨' });
});

module.exports = app;
