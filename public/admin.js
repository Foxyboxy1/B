// B Studio — Store Operations Engine (v2.0)
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (Number(n || 0) / 100).toLocaleString('en-EG', { maximumFractionDigits: 2 }) + ' EGP';
const date = v => new Date(v).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

const names = {
  new: 'طلب جديد',
  confirmed: 'تم التأكيد',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  returned: 'مرتجع'
};

const next = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: []
};

let csrf = '';
let data = {};
let page = 'overview';
let ordersPage = 0;
let ordersStatus = '';
let days = 30;
let timer = null;

const toast = t => {
  const el = $('#toast');
  if (!el) return;
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), 3500);
};

async function api(route, body, method) {
  const r = await fetch('/api/' + route, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json();
  if (!r.ok) {
    if (r.status === 401 && route !== 'login') {
      showLogin();
    }
    throw Error(d.error || 'حصلت مشكلة في الاتصال');
  }
  return d;
}

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
}

async function boot() {
  try {
    const s = await api('admin/me');
    csrf = s.csrf;
    $('#adminEmail').textContent = s.email;
    $('#environmentBadge').textContent = s.demo ? 'LOCAL DEMO' : 'LIVE STORE';
    $('#app').hidden = false;
    $('#login').hidden = true;
    data = await api('admin/data');
    await navigate(page);
  } catch (e) {
    if (csrf) toast(e.message);
    else showLogin();
  }
}

const loginForm = $('#loginForm');
if (loginForm) {
  loginForm.onsubmit = async e => {
    e.preventDefault();
    const b = e.target.querySelector('button');
    const errEl = $('#loginError');
    b.disabled = true;
    if (errEl) errEl.textContent = '';
    try {
      await api('login', Object.fromEntries(new FormData(e.target)));
      e.target.reset();
      await boot();
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
}

const logoutBtn = $('#logout');
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    try {
      await api('admin/logout', {});
      csrf = '';
      showLogin();
    } catch (e) {
      toast(e.message);
    }
  };
}

const badge = s => `<span class="status-badge ${esc(s)}">${names[s] || esc(s)}</span>`;
const empty = t => `<div style="padding: 40px 20px; text-align: center; color: var(--muted); font-size: 13px;">${t}</div>`;

function orderTable(rows) {
  if (!rows || !rows.length) {
    return empty('لا توجد طلبات مسجلة في هذه الفترة بعد.');
  }
  return `
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>رقم الطلب</th>
            <th>العميلة</th>
            <th>المحافظة</th>
            <th>الإجمالي</th>
            <th>الحالة</th>
            <th>تاريخ الطلب</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(o => `
            <tr>
              <td dir="ltr" style="font-weight: 700; color: var(--hot); font-family: var(--en);">${esc(o.code)}</td>
              <td><b>${esc(o.name)}</b></td>
              <td>${esc(o.governorate)}</td>
              <td dir="ltr" style="font-weight: 600;">${money(o.total)}</td>
              <td>${badge(o.status)}</td>
              <td style="font-size: 11px; color: var(--muted);">${date(o.created_at)}</td>
              <td>
                <button class="btn-secondary-admin" style="padding: 6px 12px; font-size: 11px;" data-order="${esc(o.id)}">
                  تفاصيل ↗
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function chart(rows) {
  if (!rows || !rows.length) {
    return empty('رسم المبيعات هيظهر تلقائياً بمجرد تسجيل وتسليم أول طلبات.');
  }
  const max = Math.max(...rows.map(r => r.revenue), 1);
  return `
    <div class="chart-container">
      ${rows.slice(-30).map(r => `
        <div class="chart-col" title="${esc(r.date)}: ${money(r.revenue)} (${r.orders} طلب)">
          <div class="chart-bar-fill" style="height: ${Math.max(6, (r.revenue / max) * 160)}px"></div>
          <small>${esc(r.date.slice(5))}</small>
        </div>
      `).join('')}
    </div>
    <p style="font-size: 11px; color: var(--muted); margin-top: 12px;">
      قيمة الطلبات المسلّمة حسب تاريخ تسجيل الطلب (شاملة الشحن) • بتوقيت القاهرة، وليست تواريخ تحويلات شركة الشحن.
    </p>
  `;
}

async function navigate(p) {
  page = p;
  const navBtn = document.querySelector(`[data-page="${p}"]`);
  $('#pageTitle').textContent = navBtn ? navBtn.querySelector('.nav-text')?.textContent || p : p;
  $$('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === p));

  const content = $('#content');
  content.innerHTML = empty('جاري تحميل وتحديث البيانات...');

  try {
    if (p === 'overview' || p === 'reports') {
      const [r, orders] = await Promise.all([
        api('admin/reports?days=' + days),
        p === 'overview' ? api('admin/orders') : Promise.resolve([])
      ]);

      content.innerHTML = `
        ${p === 'overview' ? `
          <div class="welcome-banner">
            <div>
              <h2>صباح الشياكة والتفاصيل الحلوة ♡</h2>
              <p>أداء الطلبات المسجلة خلال آخر ${days} يوم، حسب حالتها الحالية.</p>
            </div>
            <span class="welcome-sparkle">✧</span>
          </div>
        ` : ''}

        <div class="admin-toolbar">
          <h2 style="font-size: 18px; margin: 0;">${p === 'reports' ? 'تحليلات المبيعات ومصادر الزيارات' : 'مؤشرات الأداء الرئيسية'}</h2>
          <select id="reportDays" aria-label="تحديد الفترة الزمنية">
            <option value="7">آخر 7 أيام</option>
            <option value="30">آخر 30 يوم</option>
            <option value="90">آخر 90 يوم</option>
            <option value="365">آخر سنة</option>
          </select>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-header">
              <span>قيمة الطلبات المسلّمة</span>
              <span style="color: var(--success);">● مسلّم</span>
            </div>
            <div class="stat-value">${money(r.revenue)}</div>
            <div class="stat-note">من الطلبات المسلّمة (شامل الشحن)</div>
          </div>

          <div class="stat-card">
            <div class="stat-header">
              <span>إجمالي الطلبات</span>
              <span>📦</span>
            </div>
            <div class="stat-value">${r.orders}</div>
            <div class="stat-note">كل الطلبات المسجلة في الفترة</div>
          </div>

          <div class="stat-card">
            <div class="stat-header">
              <span>قيد التجهيز والشحن</span>
              <span style="color: var(--info);">⏳ جاري</span>
            </div>
            <div class="stat-value">${r.pending}</div>
            <div class="stat-note">جديد + مؤكد + مع المندوب</div>
          </div>

          <div class="stat-card">
            <div class="stat-header">
              <span>ملغي ومرتجع</span>
              <span style="color: var(--danger);">✕ مستبعد</span>
            </div>
            <div class="stat-value">${r.cancelled}</div>
            <div class="stat-note">تم استرجاع المخزون الخاص بهم</div>
          </div>
        </div>

        <div class="two-col-grid">
          <div class="admin-panel">
            <div class="panel-header">
              <h2>الطلبات المسلّمة حسب تاريخ التسجيل</h2>
              <span class="status-badge delivered">${r.delivered} طلب مسلّم</span>
            </div>
            ${chart(r.daily)}
          </div>

          <div class="admin-panel">
            <div class="panel-header">
              <h2>تنبيهات المخزون الحرج</h2>
              <button class="btn-secondary-admin" data-page="products" style="padding: 4px 10px; font-size: 11px;">إدارة المخزون ↗</button>
            </div>
            ${r.low_stock && r.low_stock.length ? r.low_stock.map(x => `
              <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 12px;">
                <span>${esc(x.name)}</span>
                <span class="low-stock-warn">متبقي ${x.stock} فقط</span>
              </div>
            `).join('') : empty('المخزون مستقر وممتاز ♡')}
          </div>
        </div>

        ${p === 'overview' ? `
          <div class="admin-panel">
            <div class="panel-header">
              <h2>أحدث الطلبات المستلمة</h2>
              <button class="btn-secondary-admin" data-page="orders">كل الطلبات ↗</button>
            </div>
            ${orderTable(orders.slice(0, 8))}
          </div>
        ` : `
          <div class="two-col-grid">
            <div class="admin-panel">
              <div class="panel-header">
                <h2>مصادر الزيارات والطلبات (UTM)</h2>
              </div>
              ${r.sources && r.sources.length ? `
                <div class="table-responsive">
                  <table>
                    <thead>
                      <tr><th>المصدر / الحملة</th><th>الطلبات</th><th>المبالغ المسلّمة</th></tr>
                    </thead>
                    <tbody>
                      ${r.sources.map(s => `
                        <tr>
                          <td><b>${esc(s.source)}</b></td>
                          <td dir="ltr">${s.orders}</td>
                          <td dir="ltr" style="font-weight: 600;">${money(s.revenue)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : empty('بيانات المصادر بتظهر هنا تلقائياً لما توصل زيارات بحملات UTM مع موافقة الزائرة.')}
            </div>

            <div class="admin-panel">
              <div class="panel-header">
                <h2>أكثر القطع طلباً ومبيعاً</h2>
              </div>
              ${r.top && r.top.length ? `
                <div class="table-responsive">
                  <table>
                    <thead>
                      <tr><th>القطعة</th><th>الكمية</th><th>الإجمالي</th></tr>
                    </thead>
                    <tbody>
                      ${r.top.map(t => `
                        <tr>
                          <td>${esc(t.name)}</td>
                          <td dir="ltr"><b>${t.quantity}</b></td>
                          <td dir="ltr" style="color: var(--hot); font-weight: 600;">${money(t.revenue)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : empty('يبدأ الترتيب تلقائياً بعد تسليم أول طلبات.')}
            </div>
          </div>
        `}
      `;

      $('#reportDays').value = days;
      $('#reportDays').onchange = e => {
        days = Number(e.target.value);
        navigate(page);
      };
    } else if (p === 'orders') {
      const rows = await api(`admin/orders?page=${ordersPage}&status=${ordersStatus}`);
      content.innerHTML = `
        <div class="admin-toolbar">
          <div style="display: flex; gap: 12px; align-items: center;">
            <select id="orderStatus" aria-label="تصفية بالحالة">
              <option value="">جميع الحالات</option>
              ${Object.entries(names).map(([k, n]) => `
                <option value="${k}" ${ordersStatus === k ? 'selected' : ''}>${n}</option>
              `).join('')}
            </select>
          </div>
          <a class="btn-secondary-admin" href="/api/admin/export">
            <span>تصدير الطلبات CSV</span>
            <span>📥</span>
          </a>
        </div>

        <div class="admin-panel">
          ${orderTable(rows)}
        </div>

        <div style="display: flex; justify-content: center; gap: 16px; align-items: center; margin-top: 20px;">
          <button class="btn-secondary-admin" id="prevOrders" ${!ordersPage ? 'disabled' : ''}>السابق</button>
          <span style="font-size: 13px; font-weight: 600;">صفحة ${ordersPage + 1}</span>
          <button class="btn-secondary-admin" id="nextOrders" ${rows.length < 50 ? 'disabled' : ''}>التالي</button>
        </div>
      `;

      $('#orderStatus').onchange = e => {
        ordersStatus = e.target.value;
        ordersPage = 0;
        navigate('orders');
      };
      $('#prevOrders').onclick = () => { ordersPage--; navigate('orders'); };
      $('#nextOrders').onclick = () => { ordersPage++; navigate('orders'); };

    } else if (p === 'products') {
      content.innerHTML = `
        <div class="admin-toolbar">
          <h2 style="font-size: 18px; margin: 0;">الكتالوج (${data.products.length} قطعة)</h2>
          <button class="btn-primary-admin" id="newProduct">
            <span>إضافة منتج جديد</span>
            <i>＋</i>
          </button>
        </div>

        <div class="admin-callout">
          ✦ نصيحة: المخزون مبدئياً صفر في نسخة الإنتاج الجديدة. راجعي المقاسات والخامات والكميات المتوفرة واضغطي تعديل قبل تفعيل استقبال الطلبات للجمهور.
        </div>

        <div class="admin-panel">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>القسم</th>
                  <th>السعر</th>
                  <th>قبل الخصم</th>
                  <th>المخزون</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${data.products.map(p => `
                  <tr>
                    <td>
                      <div class="product-cell">
                        <img class="product-thumb-sm" src="${esc(p.images[0])}" alt="">
                        <div>
                          <div style="font-weight: 600;">${esc(p.name)}</div>
                          <div class="sku-text">${esc(p.sku)}</div>
                        </div>
                      </div>
                    </td>
                    <td>${esc(data.categories.find(c => c.id === p.category_id)?.name || '—')}</td>
                    <td dir="ltr" style="font-weight: 700;">${money(p.price)}</td>
                    <td dir="ltr" style="color: var(--muted);">${p.compare_price > p.price ? money(p.compare_price) : '—'}</td>
                    <td dir="ltr" class="${p.stock <= 3 ? 'low-stock-warn' : ''}">
                      <b>${p.stock}</b>
                    </td>
                    <td>
                      <span class="status-badge ${p.active ? 'delivered' : 'cancelled'}">
                        ${p.active ? 'ظاهر' : 'مخفي'}
                      </span>
                    </td>
                    <td>
                      <button class="btn-secondary-admin" style="padding: 6px 14px;" data-edit-product="${esc(p.id)}">
                        تعديل ✎
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      $('#newProduct').onclick = () => editProduct();

    } else if (p === 'categories') {
      content.innerHTML = `
        <div class="admin-toolbar">
          <h2 style="font-size: 18px; margin: 0;">أقسام وتصنيفات المتجر</h2>
          <button class="btn-primary-admin" id="newCategory">
            <span>إضافة قسم جديد</span>
            <i>＋</i>
          </button>
        </div>

        <div class="admin-panel">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>القسم</th>
                  <th>الترتيب</th>
                  <th>عدد القطع</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${data.categories.map(c => `
                  <tr>
                    <td><b>${esc(c.name)}</b></td>
                    <td dir="ltr">${c.sort_order}</td>
                    <td dir="ltr">${data.products.filter(p => p.category_id === c.id).length}</td>
                    <td>
                      <span class="status-badge ${c.active ? 'delivered' : 'cancelled'}">
                        ${c.active ? 'نشط' : 'مخفي'}
                      </span>
                    </td>
                    <td>
                      <button class="btn-secondary-admin" style="padding: 6px 14px;" data-edit-category="${esc(c.id)}">
                        تعديل
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      $('#newCategory').onclick = () => editCategory();

    } else if (p === 'coupons') {
      content.innerHTML = `
        <div class="admin-toolbar">
          <h2 style="font-size: 18px; margin: 0;">أكواد الخصم والعروض</h2>
          <button class="btn-primary-admin" id="newCoupon">
            <span>كوبون جديد</span>
            <i>＋</i>
          </button>
        </div>

        <div class="admin-panel">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>نوع وقيمة الخصم</th>
                  <th>مرات الاستخدام</th>
                  <th>الحد الأقصى</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${data.coupons.map(c => `
                  <tr>
                    <td dir="ltr" style="font-weight: 700; color: var(--hot); font-family: var(--en);">${esc(c.code)}</td>
                    <td dir="ltr"><b>${c.kind === 'percent' ? c.amount + '%' : money(c.amount)}</b></td>
                    <td dir="ltr">${c.used_count}</td>
                    <td dir="ltr">${c.max_uses || 'غير محدود'}</td>
                    <td>
                      <span class="status-badge ${c.active ? 'delivered' : 'cancelled'}">
                        ${c.active ? 'نشط' : 'موقوف'}
                      </span>
                    </td>
                    <td>
                      <button class="btn-secondary-admin" style="padding: 6px 14px;" data-edit-coupon="${esc(c.code)}">
                        تعديل
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${!data.coupons.length ? empty('لا توجد كوبونات مسجلة حالياً.') : ''}
        </div>
      `;
      $('#newCoupon').onclick = () => editCoupon();

    } else if (p === 'settings') {
      settingsForm(false);
    } else if (p === 'integrations') {
      settingsForm(true);
    }
  } catch (e) {
    content.innerHTML = `<div class="admin-panel admin-error">${esc(e.message)}</div>`;
  }
}

function editor(title, html) {
  $('#editorTitle').textContent = title;
  $('#editorContent').innerHTML = html;
  $('#editor').showModal();
}

const field = (label, name, value = '', type = 'text', extra = '') => `
  <label>
    <span>${label}</span>
    <input name="${name}" value="${esc(value)}" type="${type}" ${extra}>
  </label>
`;

async function handleForm(form, route, transform) {
  form.onsubmit = async e => {
    e.preventDefault();
    const b = form.querySelector('[type=submit]');
    const err = form.querySelector('.admin-error');
    b.disabled = true;
    if (err) err.textContent = '';
    try {
      await api(route, transform(Object.fromEntries(new FormData(form))));
      $('#editor').close();
      data = await api('admin/data');
      await navigate(page);
      toast('تم حفظ التعديلات بنجاح ♡');
    } catch (errExp) {
      if (err) err.textContent = errExp.message;
    } finally {
      b.disabled = false;
    }
  };
}

function editProduct(pid) {
  const p = data.products.find(x => x.id === pid) || {
    images: [],
    active: true,
    price: 0,
    compare_price: 0,
    stock: 0
  };

  editor(pid ? 'تعديل بيانات المنتج' : 'إضافة منتج جديد للكتالوج', `
    <form id="productForm">
      <div class="admin-form-grid">
        ${field('الاسم بالعربي', 'name', p.name, 'text', 'required maxlength="180"')}
        ${field('الاسم بالإنجليزي', 'name_en', p.name_en, 'text', 'required maxlength="180"')}
        ${field('رمز SKU فريد', 'sku', p.sku, 'text', 'required maxlength="80"')}
        <label>
          <span>القسم</span>
          <select name="category_id">
            ${data.categories.map(c => `
              <option value="${esc(c.id)}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>
            `).join('')}
          </select>
        </label>
        ${field('السعر الحالي بالجنيه', 'price', p.price / 100, 'number', 'required min="0.01" step="0.01"')}
        ${field('السعر قبل الخصم (اختياري)', 'compare_price', p.compare_price / 100, 'number', 'min="0" step="0.01"')}
        ${field('الكمية المتاحة في المخزون', 'stock', p.stock, 'number', 'required min="0" step="1"')}

        <label class="check-label">
          <input name="active" type="checkbox" ${p.active ? 'checked' : ''}>
          <span>ظاهر ومتاح للشراء في المتجر</span>
        </label>

        <label class="check-label">
          <input name="featured" type="checkbox" ${p.featured ? 'checked' : ''}>
          <span>تمييز في الواجهة كقطعة مختارة</span>
        </label>

        <label class="full-col">
          <span>الوصف والخامة والمقاس</span>
          <textarea name="description" rows="3" minlength="5" maxlength="3000" required>${esc(p.description)}</textarea>
        </label>

        <label class="full-col">
          <span>روابط الصور (رابط في كل سطر)</span>
          <textarea id="imageUrls" name="images" rows="3" required dir="ltr">${p.images.map(esc).join('\n')}</textarea>
        </label>

        <label class="full-col">
          <span>رفع صورة جديدة من جهازك (JPG / PNG / WebP)</span>
          <input id="uploadImage" type="file" accept="image/jpeg,image/png,image/webp">
        </label>
      </div>

      <p class="admin-error" role="alert"></p>

      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
        <button type="submit" class="btn-primary-admin">حفظ المنتج</button>
      </div>
    </form>
  `);

  handleForm($('#productForm'), 'admin/products', b => ({
    ...b,
    id: p.id,
    updated_at: p.updated_at,
    revision: p.revision,
    price: Math.round(Number(b.price) * 100),
    compare_price: Math.round(Number(b.compare_price) * 100),
    stock: Number(b.stock),
    active: !!b.active,
    featured: !!b.featured,
    images: b.images.split('\n').map(x => x.trim()).filter(Boolean)
  }));

  $('#uploadImage').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 3000000) return toast('الصورة أكبر من 3 ميجابايت');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        s += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      const r = await api('admin/media', { base64: btoa(s) });
      $('#imageUrls').value = ($('#imageUrls').value.trim() + '\n' + r.url).trim();
      toast('تم رفع الصورة وحفظها بنجاح');
    } catch (err) {
      toast(err.message);
    }
  };
}

function editCategory(cid) {
  const c = data.categories.find(x => x.id === cid) || { active: 1, sort_order: 0 };
  editor('إدارة بيانات القسم', `
    <form id="categoryForm">
      <div class="admin-form-grid">
        ${field('اسم القسم', 'name', c.name, 'text', 'required')}
        ${field('ترتيب العرض', 'sort_order', c.sort_order, 'number', 'min="0" max="999"')}
        <label class="check-label full-col">
          <input type="checkbox" name="active" ${c.active ? 'checked' : ''}>
          <span>القسم نشط ومعروض في المتجر</span>
        </label>
      </div>
      <p class="admin-error"></p>
      <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
        <button type="submit" class="btn-primary-admin">حفظ القسم</button>
      </div>
    </form>
  `);
  handleForm($('#categoryForm'), 'admin/categories', b => ({
    ...b,
    id: c.id,
    sort_order: Number(b.sort_order),
    active: !!b.active
  }));
}

function editCoupon(code) {
  const c = data.coupons.find(x => x.code === code) || { kind: 'percent', amount: 10, active: 1 };
  editor('إدارة كود الخصم', `
    <form id="couponForm">
      <div class="admin-form-grid">
        ${field('كود الخصم', 'code', c.code, 'text', 'required pattern="[A-Za-z0-9_-]+" ' + (code ? 'readonly' : ''))}
        <label>
          <span>نوع الخصم</span>
          <select name="kind">
            <option value="percent" ${c.kind === 'percent' ? 'selected' : ''}>نسبة مئوية (%)</option>
            <option value="fixed" ${c.kind === 'fixed' ? 'selected' : ''}>مبلغ ثابت بالجنيه (EGP)</option>
          </select>
        </label>
        ${field('قيمة الخصم', 'amount', c.kind === 'fixed' ? c.amount / 100 : c.amount, 'number', 'min="0.01" step="0.01" required')}
        ${field('الحد الأدنى لقيمة الطلب', 'min_total', (c.min_total || 0) / 100, 'number', 'min="0" step="0.01"')}
        ${field('أقصى مرات استخدام (0 = غير محدود)', 'max_uses', c.max_uses || 0, 'number', 'min="0" step="1"')}
        ${field('تاريخ الانتهاء (اختياري)', 'expires_at', c.expires_at ? new Date(new Date(c.expires_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '', 'datetime-local')}
        <label class="check-label full-col">
          <input type="checkbox" name="active" ${c.active ? 'checked' : ''}>
          <span>الكوبون نشط وجاهز للاستخدام</span>
        </label>
      </div>
      <p class="admin-error"></p>
      <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
        <button type="submit" class="btn-primary-admin">حفظ الكوبون</button>
      </div>
    </form>
  `);
  handleForm($('#couponForm'), 'admin/coupons', b => ({
    ...b,
    amount: b.kind === 'fixed' ? Math.round(Number(b.amount) * 100) : Number(b.amount),
    min_total: Math.round(Number(b.min_total) * 100),
    max_uses: Number(b.max_uses),
    active: !!b.active,
    expires_at: b.expires_at ? new Date(b.expires_at).toISOString() : ''
  }));
}

async function viewOrder(id) {
  try {
    const o = await api('admin/orders/' + id);
    editor(`تفاصيل الطلب: ${o.code}`, `
      <div class="order-detail-meta">
        <div>
          <strong style="color: var(--hot); font-size: 16px;">${esc(o.name)}</strong>
          <p dir="ltr" style="font-weight: 700; margin: 4px 0;">📱 ${esc(o.phone)}</p>
          <p style="margin: 0; color: var(--ink-soft); font-size: 13px;">📍 ${esc(o.governorate)} — ${esc(o.address)}</p>
        </div>
        <div>
          ${badge(o.status)}
          <p style="margin-top: 8px; font-size: 13px; line-height: 1.8;">
            طريقة الدفع: <b>الدفع عند الاستلام كاش</b><br>
            إجمالي الطلب المستحق: <b>${money(o.total)}</b><br>
            (القطع: ${money(o.subtotal)} | الشحن: ${money(o.shipping)}${o.discount ? ` | الخصم: -${money(o.discount)}` : ''})
          </p>
        </div>
      </div>

      ${o.note ? `<p style="background: #fff; padding: 10px 14px; border: 1px solid var(--line); border-radius: 6px; font-size: 12px;"><b>ملاحظة العميلة:</b> ${esc(o.note)}</p>` : ''}

      <h3 style="font-size: 15px; margin: 20px 0 10px;">القطع المطلوبة</h3>
      <div class="table-responsive">
        <table>
          <thead>
            <tr><th>القطعة</th><th>الكمية × السعر</th><th>الإجمالي</th></tr>
          </thead>
          <tbody>
            ${o.items.map(p => `
              <tr>
                <td><b>${esc(p.name)}</b> <span style="font-size: 10px; color: var(--muted); font-family: var(--en);">(${esc(p.sku)})</span></td>
                <td dir="ltr">${p.quantity} × ${money(p.price)}</td>
                <td dir="ltr" style="font-weight: 700;">${money(p.price * p.quantity)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="background: #fff; padding: 20px; border: 1px solid var(--line); border-radius: var(--radius-sm); margin-top: 24px;">
        <h3 style="font-size: 14px; margin: 0 0 14px;">تحديث حالة الشحن والطلب</h3>
        ${next[o.status].length ? `
          <form id="statusForm">
            <div class="admin-form-grid">
              <label>
                <span>الانتقال للحالة التالية</span>
                <select name="status">
                  ${next[o.status].map(s => `<option value="${s}">${names[s]}</option>`).join('')}
                </select>
              </label>
              ${field('ملاحظة داخلية في السجل', 'note')}
            </div>
            <p class="admin-error"></p>
            <div style="display: flex; justify-content: flex-end; margin-top: 14px;">
              <button class="btn-primary-admin" type="submit">تحديث الحالة الآن</button>
            </div>
          </form>
        ` : '<p style="color: var(--muted); margin: 0; font-size: 13px;">هذه الحالة نهائية ومكتملة في السجل.</p>'}
      </div>

      <div class="order-timeline-box">
        <h4 style="font-size: 14px; margin-bottom: 14px;">سجل أحداث الطلب والتتبع</h4>
        ${o.events.map(e => `
          <div class="order-timeline-item">
            <b>${names[e.status] || e.status}</b>
            <span style="font-size: 11px; color: var(--muted); margin-right: 12px;">${date(e.created_at)}</span>
            ${e.note ? `<p style="margin: 4px 0 0; font-size: 12px; color: var(--muted);">${esc(e.note)}</p>` : ''}
          </div>
        `).join('')}
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--line);">
        <button class="btn-secondary-admin" id="printOrder">
          <span>طباعة بوليصة / فاتورة الطلب</span>
          <span>🖨</span>
        </button>
      </div>
    `);

    const statusForm = $('#statusForm');
    if (statusForm) {
      statusForm.onsubmit = async e => {
        e.preventDefault();
        const b = e.target.querySelector('button');
        const err = e.target.querySelector('.admin-error');
        b.disabled = true;
        if (err) err.textContent = '';
        try {
          await api('admin/orders/' + id, Object.fromEntries(new FormData(e.target)), 'PATCH');
          data = await api('admin/data');
          $('#editor').close();
          await navigate(page);
          toast('تم تحديث حالة الطلب بنجاح ♡');
        } catch (errExp) {
          if (err) err.textContent = errExp.message;
        } finally {
          b.disabled = false;
        }
      };
    }

    const printBtn = $('#printOrder');
    if (printBtn) printBtn.onclick = () => window.print();

  } catch (err) {
    toast(err.message);
  }
}

function settingsForm(integrations) {
  const s = data.settings;
  const content = $('#content');

  content.innerHTML = `
    ${integrations ? `
      <div class="admin-callout">
        ✦ إعدادات الربط الإعلاني والتتبع: يمكنك هنا ربط معرّفات Meta Pixel وGoogle Analytics 4 وGoogle Ads لمتابعة التحويلات ورفع كتالوج المنتجات. لا يتم تفعيل أي تتبع إلا بعد موافقة الزائرة صراحةً على ملفات تعريف الارتباط.
      </div>
    ` : ''}

    <form id="settingsForm">
      <div class="admin-panel">
        <div class="panel-header">
          <h2>${integrations ? 'معرّفات المنصات الإعلانية' : 'إعدادات المتجر العامة وسياسة الشحن'}</h2>
          <span class="status-badge ${s.ready ? 'delivered' : 'cancelled'}">
            ${s.ready ? 'المتجر يستقبل الطلبات' : 'المتجر تحت التجهيز'}
          </span>
        </div>

        <div class="admin-form-grid">
          ${integrations ? `
            ${field('Google Analytics 4 ID (G-…)', 'ga4', s.ga4, 'text', 'dir="ltr"')}
            ${field('Meta Pixel ID', 'meta_pixel', s.meta_pixel, 'text', 'dir="ltr"')}
            ${field('Google Ads ID (AW-…)', 'google_ads', s.google_ads, 'text', 'dir="ltr"')}
            ${field('Google Ads Conversion Label', 'google_ads_label', s.google_ads_label, 'text', 'dir="ltr"')}
          ` : `
            ${field('اسم البراند', 'brand', s.brand, 'text', 'required')}
            ${field('العنوان الرئيسي في الهيرو', 'headline', s.headline, 'text', 'required')}
            <label class="full-col">
              <span>الوصف الترحيبي</span>
              <textarea name="subline" rows="2" required>${esc(s.subline)}</textarea>
            </label>
            ${field('رقم الموبايل / واتساب للتواصل', 'phone', s.phone, 'text', 'required')}
            ${field('رابط حساب إنستجرام الرسمي', 'instagram', s.instagram, 'url', 'required dir="ltr"')}
            ${field('مصاريف الشحن بالجنيه (EGP)', 'shipping', s.shipping / 100, 'number', 'min="0" step="0.01" required')}
            ${field('شحن مجاني للطلبات فوق (0 = معطل)', 'free_shipping', s.free_shipping / 100, 'number', 'min="0" step="0.01"')}
            <label class="full-col">
              <span>رسالة وملاحظة التوصيل للعميلة</span>
              <textarea name="shipping_note" rows="2" required>${esc(s.shipping_note)}</textarea>
            </label>
            <label class="full-col">
              <span>سياسة الشحن والاستبدال والاسترجاع</span>
              <textarea name="policy" rows="4" required>${esc(s.policy)}</textarea>
            </label>
            <label class="check-label full-col">
              <input type="checkbox" name="ready" ${s.ready ? 'checked' : ''}>
              <span>تفعيل استقبال الطلبات من الزوار في المتجر الآن</span>
            </label>
          `}
        </div>

        <p class="admin-error"></p>

        <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
          <button type="submit" class="btn-primary-admin">حفظ الإعدادات</button>
        </div>
      </div>
    </form>

    ${integrations ? `
      <div class="two-col-grid">
        <div class="admin-panel">
          <div class="panel-header">
            <h2>Meta Conversions API (CAPI)</h2>
          </div>
          <p style="font-size: 13px; line-height: 1.8; color: var(--muted);">
            حالة الخادم: <b>${data.integration && data.integration.meta_server ? 'متصل وجاهز للإرسال' : 'غير مُعد — يتطلب وضع META_ACCESS_TOKEN في Hostinger'}</b><br>
            يتم تسجيل حدث Lead عند استلام طلب COD، وحدث Purchase بعد تحديث الحالة إلى "تم التسليم".
          </p>
          <button class="btn-secondary-admin" id="sendEvents">
            إرسال أو إعادة محاولة الأحداث المعلقة الآن ↺
          </button>
        </div>

        <div class="admin-panel">
          <div class="panel-header">
            <h2>كتالوج المنتجات (XML Feed)</h2>
          </div>
          <p style="font-size: 13px; line-height: 1.8; color: var(--muted);">
            رابط الكتالوج متوافق مع Meta Commerce Manager وGoogle Merchant Center.<br>
            <code style="display: block; padding: 8px 12px; background: var(--bg); border-radius: 4px; margin: 10px 0; font-family: var(--en);" dir="ltr">
              ${esc(location.origin)}/feed.xml
            </code>
          </p>
          <a class="btn-secondary-admin" href="/feed.xml" target="_blank" rel="noopener">
            معاينة ملف XML ↗
          </a>
        </div>
      </div>

      <div class="admin-panel">
        <div class="panel-header">
          <h2>سجل إرسال أحداث Meta CAPI</h2>
        </div>
        ${data.outbox && data.outbox.length ? `
          <div class="table-responsive">
            <table>
              <thead>
                <tr><th>الحدث</th><th>الحالة</th><th>المحاولات</th><th>آخر استجابة</th><th>التاريخ</th></tr>
              </thead>
              <tbody>
                ${data.outbox.map(e => `
                  <tr>
                    <td><b>${esc(e.kind)}</b></td>
                    <td><span class="status-badge ${e.state === 'sent' ? 'delivered' : 'cancelled'}">${esc(e.state)}</span></td>
                    <td dir="ltr">${e.attempts} / 8</td>
                    <td style="font-size: 11px; color: var(--muted);">${esc(e.last_error || 'تم القبول')}</td>
                    <td style="font-size: 11px;">${date(e.created_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : empty('لا توجد أحداث معلقة في سجل الإرسال.')}
      </div>
    ` : ''}
  `;

  const sForm = $('#settingsForm');
  if (sForm) {
    sForm.onsubmit = async e => {
      e.preventDefault();
      const form = e.target;
      const b = form.querySelector('button');
      const err = form.querySelector('.admin-error');
      b.disabled = true;
      if (err) err.textContent = '';
      const input = Object.fromEntries(new FormData(form));
      try {
        const payload = {
          ...s,
          ...input,
          ready: integrations ? s.ready : !!input.ready,
          shipping: integrations ? s.shipping : Math.round(Number(input.shipping) * 100),
          free_shipping: integrations ? s.free_shipping : Math.round(Number(input.free_shipping) * 100)
        };
        await api('admin/settings', payload);
        data = await api('admin/data');
        await navigate(page);
        toast('تم حفظ الإعدادات بنجاح ♡');
      } catch (errExp) {
        if (err) err.textContent = errExp.message;
      } finally {
        b.disabled = false;
      }
    };
  }

  if (integrations) {
    const sendBtn = $('#sendEvents');
    if (sendBtn) {
      sendBtn.onclick = async e => {
        e.target.disabled = true;
        try {
          const r = await api('admin/integrations/send', {});
          toast(r.message || `تم إرسال ${r.sent} حدث بنجاح`);
          data = await api('admin/data');
          await navigate(page);
        } catch (err) {
          toast(err.message);
        } finally {
          e.target.disabled = false;
        }
      };
    }
  }
}

// Global Delegation for Admin
document.addEventListener('click', e => {
  const b = e.target.closest('button, a');
  if (!b) return;

  if (b.dataset.page) navigate(b.dataset.page);
  if (b.dataset.order) viewOrder(b.dataset.order);
  if (b.dataset.editProduct) editProduct(b.dataset.editProduct);
  if (b.dataset.editCategory) editCategory(b.dataset.editCategory);
  if (b.dataset.editCoupon) editCoupon(b.dataset.editCoupon);
});

const edClose = $('#editorClose');
if (edClose) edClose.onclick = () => $('#editor')?.close();

boot();
