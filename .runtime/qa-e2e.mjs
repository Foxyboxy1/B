import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {database} from '../lib/db.mjs';
import {seed} from '../scripts/seed.mjs';
import {makeHash} from '../lib/core.mjs';
import {application} from '../server.mjs';

const root = await mkdtemp(path.join(tmpdir(), 'b-qa-e2e-'));
const env = {
  DB_DRIVER: 'sqlite', SQLITE_PATH: path.join(root, 'qa.sqlite'), NODE_ENV: 'test',
  ADMIN_EMAIL: 'qa@example.test', ADMIN_PASSWORD_HASH: makeHash('local-test-password-12345'),
  ORDER_TOKEN_SECRET: 'test-secret-only-do-not-deploy-1234567890',
  PUBLIC_ORIGIN: 'http://127.0.0.1:4182', DEMO_MODE: '1'
};
const db = await database(env);
await db.initialize();
await seed(db, true);
const {server} = await application(env, db);
await new Promise(r => server.listen(4182, '127.0.0.1', r));
const O = env.PUBLIC_ORIGIN;

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  if (!cond) console.log('FAIL  ' + name + (extra ? '  -> ' + extra : ''));
  else console.log('pass  ' + name);
};
const f = (p, body, headers = {}, method) => fetch(O + p, {
  method: method || (body ? 'POST' : 'GET'),
  headers: { Origin: O, 'Content-Type': 'application/json', ...headers },
  body: body ? JSON.stringify(body) : undefined
});
const j = async r => { try { return await r.json(); } catch { return null; } };
let seq = 0;
const key = () => 'qa-idempotency-key-' + String(++seq).padStart(4, '0');
const quote = async (items, coupon) => (await j(await f('/api/quote', coupon ? { items, coupon } : { items })));

// ---------- Storefront ----------
let r = await f('/api/catalog');
let cat = await j(r);
check('GET /api/catalog == 200', r.status === 200);
check('catalog has 12 products', cat?.products?.length === 12, 'got ' + cat?.products?.length);
check('catalog has 6 categories', cat?.categories?.length === 6, 'got ' + cat?.categories?.length);
check('catalog settings ready=true (demo)', cat?.settings?.ready === true);
check('catalog product images is a non-empty array', Array.isArray(cat?.products?.[0]?.images) && cat.products[0].images.length > 0);
check('catalog does not leak secrets', !JSON.stringify(cat).match(/ADMIN_PASSWORD|ORDER_TOKEN_SECRET|MYSQL/));

let q = await quote([{ id: 'ring1', quantity: 2 }]);
check('quote 2x ring1 == 200', q?.subtotal === 18000, JSON.stringify(q));
check('quote subtotal = 18000, shipping = 2900, total = 20900', q?.subtotal === 18000 && q?.shipping === 2900 && q?.total === 20900, JSON.stringify(q));

r = await f('/api/quote', { items: [{ id: 'no-such-id', quantity: 1 }] });
check('quote unknown product rejected (409)', r.status === 409, 'status ' + r.status);
r = await f('/api/quote', { items: [{ id: 'ring1', quantity: 9 }] });
check('quote quantity over stock (9 > 8) rejected (409)', r.status === 409, 'status ' + r.status);
r = await f('/api/quote', { items: [{ id: 'ring1', quantity: 999 }] });
check('quote quantity over 20 rejected (400)', r.status === 400, 'status ' + r.status);
r = await f('/api/quote', { items: [] });
check('quote empty items rejected (400)', r.status === 400, 'status ' + r.status);
r = await f('/api/quote', { items: [{ id: 'ring1', quantity: 1 }], coupon: 'NOPE' });
check('quote invalid coupon rejected (400)', r.status === 400, 'status ' + r.status);

// ---------- Admin auth ----------
r = await f('/api/admin/data');
check('admin data without session == 401', r.status === 401, 'status ' + r.status);
r = await f('/api/login', { email: env.ADMIN_EMAIL, password: 'wrong-password' });
check('login wrong password == 401', r.status === 401, 'status ' + r.status);
r = await f('/api/login', { email: env.ADMIN_EMAIL, password: 'local-test-password-12345' }, { Origin: 'https://evil.test' });
check('login with foreign Origin == 403', r.status === 403, 'status ' + r.status);
r = await f('/api/login', { email: env.ADMIN_EMAIL, password: 'local-test-password-12345' });
const cookie = r.headers.get('set-cookie')?.split(';')[0];
const auth = await j(r);
check('login success == 200 with csrf', r.status === 200 && !!auth?.csrf);
const H = { Cookie: cookie, 'X-CSRF-Token': auth.csrf };
const GET = { Cookie: cookie };
r = await f('/api/admin/settings', { brand: 'x' }, { Cookie: cookie });
check('admin mutation without CSRF == 403', r.status === 403, 'status ' + r.status);

// ---------- Admin data ----------
r = await f('/api/admin/data', null, GET);
let adm = await j(r);
check('admin data == 200 with products/categories/settings/coupons/outbox',
  r.status === 200 && Array.isArray(adm?.products) && Array.isArray(adm?.categories) && !!adm?.settings && Array.isArray(adm?.coupons) && Array.isArray(adm?.outbox));
r = await f('/api/admin/orders', null, GET);
check('admin orders list == 200', r.status === 200);
r = await f('/api/admin/reports?days=30', null, GET);
let rep = await j(r);
check('admin reports == 200 with daily/sources/top/low_stock',
  r.status === 200 && Array.isArray(rep?.daily) && Array.isArray(rep?.sources) && Array.isArray(rep?.top) && Array.isArray(rep?.low_stock));

// ---------- Admin: categories / coupons / products / media ----------
r = await f('/api/admin/categories', { name: 'قسم اختبار', sort_order: 9, active: true }, H);
check('create category == 200', r.status === 200, 'status ' + r.status);
r = await f('/api/admin/categories', { name: 'x' }, H);
check('create category with 1-char name rejected (400)', r.status === 400, 'status ' + r.status);

r = await f('/api/admin/coupons', { code: 'QA10', kind: 'percent', amount: 10, min_total: 0, max_uses: 0, active: true, expires_at: '' }, H);
check('create percent coupon == 200', r.status === 200, 'status ' + r.status);
r = await f('/api/admin/coupons', { code: 'bad code!', kind: 'percent', amount: 10, active: true }, H);
check('invalid coupon code rejected (400)', r.status === 400, 'status ' + r.status);
r = await f('/api/admin/coupons', { code: 'QA50EGP', kind: 'fixed', amount: 5000, min_total: 0, max_uses: 0, active: true, expires_at: '' }, H);
check('create fixed coupon == 200', r.status === 200, 'status ' + r.status);
q = await quote([{ id: 'ring1', quantity: 2 }], 'QA10');
check('10% coupon discount = 1800', q?.discount === 1800, 'got ' + q?.discount);
q = await quote([{ id: 'ring1', quantity: 1 }], 'QA50EGP');
check('fixed coupon discount = 5000', q?.discount === 5000, 'got ' + q?.discount);

const newProd = {
  sku: 'QA-001', category_id: 'rings', name: 'منتج اختبار', name_en: 'QA Test Product',
  description: 'وصف تجريبي طويل بما يكفي', price: 10000, compare_price: 15000, stock: 5,
  active: true, featured: false, images: ['/assets/1770669545643309862.jpg']
};
r = await f('/api/admin/products', newProd, H);
let created = await j(r);
check('create product == 200', r.status === 200, 'status ' + r.status + ' ' + JSON.stringify(created));
r = await f('/api/admin/products', { ...newProd, compare_price: 100, price: 500 }, H);
check('compare_price < price rejected (400)', r.status === 400, 'status ' + r.status);
r = await f('/api/admin/products', { ...newProd, sku: 'QA-002', images: ['javascript:alert(1)'] }, H);
check('invalid image url rejected (400)', r.status === 400, 'status ' + r.status);
r = await f('/api/admin/products', { ...newProd, sku: 'QA-003', images: [] }, H);
check('empty images rejected (400)', r.status === 400, 'status ' + r.status);
const pid = created?.id;
r = await f('/api/admin/products', { ...newProd, id: pid, revision: 1, stock: 7 }, H);
check('update product correct revision == 200', r.status === 200, 'status ' + r.status);
r = await f('/api/admin/products', { ...newProd, id: pid, revision: 1, stock: 9 }, H);
check('update product stale revision == 409', r.status === 409, 'status ' + r.status);

const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64)]);
r = await f('/api/admin/media', { base64: png.toString('base64') }, H);
const media = await j(r);
check('upload PNG == 201', r.status === 201, 'status ' + r.status);
r = await f('/api/admin/media', { base64: Buffer.from('<svg/>').toString('base64') }, H);
check('upload non-image rejected (400)', r.status === 400, 'status ' + r.status);
if (media?.url) {
  const mr = await fetch(O + media.url);
  check('served media returns image/png', mr.status === 200 && mr.headers.get('content-type') === 'image/png', mr.headers.get('content-type'));
}

// ---------- Order lifecycle ----------
const mkOrder = async (items, extra = {}) => {
  const qt = await quote(items);
  return { name: 'عميلة اختبار', phone: '01012345678', governorate: 'القاهرة', address: 'عنوان اختبار طويل في القاهرة', note: '', items, idempotency: key(), expected_total: qt.total, consent: false, attribution: {}, ...extra };
};

r = await f('/api/orders', await mkOrder([{ id: 'ring1', quantity: 1 }]));
let order = await j(r);
check('create order == 201', r.status === 201, 'status ' + r.status + ' ' + JSON.stringify(order));
check('order returns code + token', !!order?.code && !!order?.token);

r = await f('/api/orders', { ...(await mkOrder([{ id: 'ring1', quantity: 1 }])), expected_total: 1 });
check('order with wrong expected_total == 409', r.status === 409, 'status ' + r.status);

const b1 = await mkOrder([{ id: 'bangle-88', quantity: 1 }]);
const o1 = await j(await f('/api/orders', b1));
const o2 = await j(await f('/api/orders', b1));
check('same idempotency returns same order + replayed', o1?.id === o2?.id && o2?.replayed === true);
check('order decrements stock', (await j(await f('/api/quote', { items: [{ id: 'bangle-88', quantity: 8 }] }))).error === undefined);

r = await f('/api/track', { code: order.code, token: order.token });
let tr = await j(r);
check('track with valid token == 200', r.status === 200, 'status ' + r.status);
check('track hides phone', tr && !('phone' in tr));
r = await f('/api/track', { code: order.code, token: 'x'.repeat(64) });
check('track with wrong token == 404', r.status === 404, 'status ' + r.status);

for (const st of ['confirmed', 'shipped', 'delivered']) {
  r = await f('/api/admin/orders/' + order.id, { status: st, note: 'qa' }, H, 'PATCH');
  check('order -> ' + st + ' == 200', r.status === 200, 'status ' + r.status);
}
r = await f('/api/admin/orders/' + order.id, { status: 'shipped', note: '' }, H, 'PATCH');
check('illegal transition delivered->shipped == 409', r.status === 409, 'status ' + r.status);
r = await f('/api/admin/orders/' + order.id, null, GET);
const one = await j(r);
check('order detail has items + events', Array.isArray(one?.items) && Array.isArray(one?.events) && one.items.length === 1);
r = await f('/api/admin/reports?days=365', null, GET);
rep = await j(r);
check('reports revenue counts delivered order', rep?.revenue >= 11900, 'got ' + rep?.revenue);
check('reports top selling present', rep?.top?.length > 0);

// ---------- Export / feed / static / security ----------
r = await f('/api/admin/export', null, GET);
const buf = Buffer.from(await r.arrayBuffer());
check('CSV export == 200', r.status === 200);
check('CSV starts with UTF-8 BOM', buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, 'bytes ' + buf.slice(0, 3).join(','));
check('CSV has header row', buf.toString('utf8').includes('code,name,phone'));
r = await fetch(O + '/feed.xml');
const xml = await r.text();
check('feed.xml == 200 with items + availability', r.status === 200 && xml.includes('<item>') && xml.includes('g:availability'));
r = await fetch(O + '/');
check('GET / serves storefront', r.status === 200 && (await r.text()).includes('B Accessories'));
r = await fetch(O + '/admin');
check('GET /admin serves admin page', r.status === 200);
r = await fetch(O + '/../server.mjs');
check('path traversal blocked', r.status === 403 || r.status === 404, 'status ' + r.status);
r = await f('/api/does-not-exist');
check('unknown api route == 404', r.status === 404, 'status ' + r.status);

// ---------- Settings (last, mutates shipping) ----------
const sBase = { brand: adm.settings.brand, subline: adm.settings.subline, phone: adm.settings.phone, shipping_note: adm.settings.shipping_note, policy: adm.settings.policy, instagram: adm.settings.instagram };
r = await f('/api/admin/settings', { ...sBase, revision: adm.settings.revision, headline: 'عنوان اختبار', shipping: 3500, free_shipping: 0, ready: true }, H);
check('settings save == 200', r.status === 200, 'status ' + r.status);
r = await f('/api/admin/settings', { ...sBase, revision: adm.settings.revision, headline: 'عنوان تاني', shipping: 3500, free_shipping: 0, ready: true }, H);
check('settings stale revision == 409', r.status === 409, 'status ' + r.status);
r = await f('/api/admin/settings', { ...sBase, revision: adm.settings.revision + 1, headline: 'x', shipping: 3500, free_shipping: 0, instagram: 'https://evil.example/', ready: true }, H);
check('settings with non-instagram link rejected (400)', r.status === 400, 'status ' + r.status);
r = await f('/api/admin/settings', { ...sBase, revision: adm.settings.revision + 1, headline: 'x', shipping: 3500, free_shipping: 0, ga4: 'BAD-ID', ready: true }, H);
check('settings with invalid GA4 id rejected (400)', r.status === 400, 'status ' + r.status);
// shipping change must be reflected in new quotes
q = await quote([{ id: 'ring1', quantity: 1 }]);
check('new quote after settings change uses shipping 3500', q?.shipping === 3500, 'got ' + q?.shipping);

// ---------- Logout ----------
r = await f('/api/admin/logout', {}, H);
check('logout == 200', r.status === 200, 'status ' + r.status);
r = await f('/api/admin/data', null, GET);
check('session invalid after logout == 401', r.status === 401, 'status ' + r.status);

const passed = results.filter(x => x.pass).length;
console.log('\n==== ' + passed + '/' + results.length + ' checks passed ====');
if (passed !== results.length) {
  console.log('FAILED:');
  results.filter(x => !x.pass).forEach(x => console.log('  - ' + x.name + (x.extra ? '  -> ' + x.extra : '')));
}
await new Promise(r => server.close(r));
await db.close();
await rm(root, { recursive: true, force: true });
