// B Accessories — Storefront Engine (v2.2)
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => ((n || 0) / 100).toLocaleString('en-EG', { maximumFractionDigits: 2 }) + ' EGP';
const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };

let products = [];
let categories = [];
let config = {};
let bag = read('b2-bag', {});
let wish = read('b2-wish', []);
let filter = 'all';
let favorites = false;
let mood = 'soft';
let look = [];
let coupon = '';
let quoteData = null;
let submitting = false;
let toastTimer = null;

if (!bag || typeof bag !== 'object' || Array.isArray(bag)) bag = {};
if (!Array.isArray(wish)) wish = [];

const api = async (path, body) => {
  const r = await fetch('/api/' + path, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } : {});
  const d = await r.json();
  if (!r.ok) throw Error(d.error || 'حصلت مشكلة، جربي مرة تانية');
  return d;
};

const toast = t => {
  const el = $('#toast');
  if (!el) return;
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
};

const items = () => Object.entries(bag)
  .filter(([id, q]) => products.some(p => p.id === id) && Number.isInteger(q) && q > 0 && q <= 20)
  .map(([id, quantity]) => ({ id, quantity }));

function save() {
  try {
    localStorage.setItem('b2-bag', JSON.stringify(bag));
    localStorage.setItem('b2-wish', JSON.stringify(wish));
  } catch {}
  const totalCount = items().reduce((s, p) => s + p.quantity, 0);
  const wishCount = wish.length;

  if ($('#cartCount')) $('#cartCount').textContent = totalCount;
  if ($('#wishCount')) $('#wishCount').textContent = wishCount;
  if ($('#mCartCount')) $('#mCartCount').textContent = totalCount;
  if ($('#mWishCount')) $('#mWishCount').textContent = wishCount;

  // Pulse animation on badge
  const cBadge = $('#cartCount');
  if (cBadge) {
    cBadge.classList.add('bump');
    setTimeout(() => cBadge.classList.remove('bump'), 300);
  }
}

const analyticsItems = ps => ps.map(p => ({
  item_id: p.id,
  item_name: p.name,
  price: p.price / 100,
  quantity: p.quantity || 1
}));

function render() {
  const searchVal = ($('#search')?.value || '').toLowerCase().trim();
  const inStockOnly = $('#inStock')?.checked;

  let list = products.filter(p => {
    const matchCat = filter === 'all' || p.category_id === filter;
    const matchWish = !favorites || wish.includes(p.id);
    const matchStock = !inStockOnly || p.stock > 0;
    const matchSearch = !searchVal || (p.name + ' ' + (p.name_en || '')).toLowerCase().includes(searchVal);
    return matchCat && matchWish && matchStock && matchSearch;
  });

  const sortVal = $('#sort')?.value || 'featured';
  if (sortVal === 'low') list.sort((a, b) => a.price - b.price);
  else if (sortVal === 'high') list.sort((a, b) => b.price - a.price);
  else if (sortVal === 'stock') list.sort((a, b) => b.stock - a.stock);
  else if (sortVal === 'featured') list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  // Category Pills
  const catFiltersEl = $('#categoryFilters');
  if (catFiltersEl) {
    catFiltersEl.innerHTML = [
      ['all', 'كل القطع'],
      ...categories.map(c => [c.id, c.name])
    ].map(([cid, cname]) => `
      <button data-filter="${esc(cid)}" class="cat-pill ${filter === cid && !favorites ? 'active' : ''}">
        ${esc(cname)}
      </button>
    `).join('');
  }

  // Result Count & Reset Button
  const resCountEl = $('#resultCount');
  if (resCountEl) {
    resCountEl.textContent = (favorites ? 'المفضلة • ' : '') + list.length + ' قطعة';
  }
  const resetEl = $('#resetFilters');
  if (resetEl) {
    resetEl.hidden = filter === 'all' && !favorites && !searchVal && !inStockOnly;
  }

  // Products Grid
  const productsEl = $('#products');
  if (!productsEl) return;

  if (!list.length) {
    productsEl.innerHTML = `
      <div class="empty-state">
        <span style="font-size: 40px; color: var(--hot);">♡</span>
        <strong>لسه مفيش قطع مطابقة لاختيارك</strong>
        <p>جرّبي قسم تاني أو امسحي كلمات البحث عشان تشوفي الكولكشن كامل.</p>
        <button class="btn outline-pill" id="emptyResetBtn" style="margin-top: 10px;">عرض كل القطع ↺</button>
      </div>
    `;
    const emptyBtn = $('#emptyResetBtn');
    if (emptyBtn) emptyBtn.onclick = resetAllFilters;
    return;
  }

  productsEl.innerHTML = list.map(p => {
    const isWished = wish.includes(p.id);
    const hasDiscount = p.compare_price > p.price;
    const discountPct = hasDiscount ? Math.round((1 - p.price / p.compare_price) * 100) : 0;
    const hasSecondImg = p.images && p.images.length > 1;

    let tagHtml = '';
    if (!p.stock) {
      tagHtml = '<span class="badge-tag tag-out">نفدت حالياً</span>';
    } else if (hasDiscount) {
      tagHtml = `<span class="badge-tag tag-sale">خصم ${discountPct}%</span>`;
    } else if (p.stock <= 3) {
      tagHtml = `<span class="badge-tag tag-low">باقي ${p.stock} فقط</span>`;
    }

    return `
      <article class="product-card">
        <div class="product-card-thumb">
          <a href="?product=${esc(p.id)}" data-product="${esc(p.id)}" aria-label="عرض تفاصيل ${esc(p.name)}">
            <img class="img-main" src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">
            ${hasSecondImg ? `<img class="img-hover" src="${esc(p.images[1])}" alt="${esc(p.name)}" loading="lazy">` : ''}
          </a>
          <button class="heart-toggle-btn ${isWished ? 'active' : ''}"
                  data-wish="${esc(p.id)}"
                  aria-label="إضافة ${esc(p.name)} للمفضلة"
                  aria-pressed="${isWished}">
            ${isWished ? '♥' : '♡'}
          </button>
          ${tagHtml}
        </div>

        <div class="product-card-info">
          <a href="?product=${esc(p.id)}" data-product="${esc(p.id)}">
            <h3 class="product-card-title">${esc(p.name)}</h3>
            <div class="product-card-en">${esc(p.name_en || '')}</div>
          </a>
          <div class="product-card-pricing">
            <span class="current-price">${money(p.price)}</span>
            ${hasDiscount ? `<span class="compare-price">${money(p.compare_price)}</span>` : ''}
          </div>
        </div>

        <button class="quick-add-btn" data-add="${esc(p.id)}" ${!p.stock ? 'disabled' : ''}>
          <span>${p.stock ? 'أضيفي للشنطة' : 'نفدت مؤقتاً'}</span>
          <span>${p.stock ? '＋' : '×'}</span>
        </button>
      </article>
    `;
  }).join('');
}

function resetAllFilters() {
  filter = 'all';
  favorites = false;
  if ($('#search')) $('#search').value = '';
  if ($('#inStock')) $('#inStock').checked = false;
  render();
}

function changeFilter(id) {
  filter = id;
  favorites = false;
  if ($('#search')) $('#search').value = '';
  render();
  const shopEl = $('#shop');
  if (shopEl) shopEl.scrollIntoView({ behavior: 'smooth' });
}

function add(id, quiet = false) {
  const p = products.find(x => x.id === id);
  if (!p || !p.stock) return toast('القطعة غير متوفرة حالياً');
  if ((bag[id] || 0) >= Math.min(p.stock, 20)) return toast('وصلتي لأقصى كمية متاحة من هذه القطعة');

  bag[id] = (bag[id] || 0) + 1;
  save();

  if (!quiet) toast(`اتضافت لشنطتك: ${p.name} ♡`);

  if (window.BTracking) {
    BTracking.event('add_to_cart', {
      currency: 'EGP',
      value: p.price / 100,
      items: analyticsItems([p])
    }, 'AddToCart');
  }

  const cartModal = $('#cartModal');
  if (cartModal && cartModal.open) renderCart();
}

function openProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  const isWished = wish.includes(p.id);
  const hasDiscount = p.compare_price > p.price;
  const detailEl = $('#productDetail');
  if (!detailEl) return;

  detailEl.innerHTML = `
    <div class="detail-layout">
      <div class="detail-gallery">
        <div class="detail-main-img-box">
          <img id="detailMainImg" src="${esc(p.images[0])}" alt="${esc(p.name)}">
        </div>
        <div class="detail-thumbs">
          ${p.images.map((src, i) => `
            <button class="detail-thumb-btn ${i === 0 ? 'active' : ''}" data-img="${esc(src)}" aria-label="صورة ${i + 1}">
              <img src="${esc(src)}" alt="${esc(p.name)}">
            </button>
          `).join('')}
        </div>
      </div>

      <div class="detail-info-col">
        <span class="detail-eyebrow">B ACCESSORIES • ${esc(categories.find(c => c.id === p.category_id)?.name || 'COLLECTION')}</span>
        <h2 class="detail-title">${esc(p.name)}</h2>
        <div class="detail-en">${esc(p.name_en || '')}</div>

        <div class="detail-price-box">
          <span class="detail-current">${money(p.price)}</span>
          ${hasDiscount ? `<span class="detail-compare">${money(p.compare_price)}</span>` : ''}
        </div>

        <p class="detail-desc">${esc(p.description)}</p>

        <div class="detail-stock-badge">
          <span>●</span>
          <span>${p.stock > 0 ? `متوفر في المخزون (${p.stock} قطع)` : 'نفدت الكمية مؤقتاً'}</span>
        </div>

        <div class="detail-actions">
          <button class="btn primary-dark" style="width: 100%; border-radius: var(--radius-full);" data-add="${esc(p.id)}" ${!p.stock ? 'disabled' : ''}>
            <span>${p.stock ? 'أضيفي للشنطة الآن' : 'غير متوفرة حالياً'}</span>
            <span>＋</span>
          </button>
          <button class="tryon-trigger-btn" data-product-id="${esc(p.id)}" title="جربي الإكسسوار عليكِ بالذكاء الاصطناعي">
            <span class="tryon-sparkle">✨</span>
            <span>جربي القطعة عليكِ — AI Try-On</span>
          </button>
          <button class="detail-wish-btn" data-detail-wish="${esc(p.id)}">
            ${isWished ? 'محفوظة في قائمة أمنياتك ♥' : 'احفظيها في المفضلة ♡'}
          </button>
        </div>

        <p class="detail-trust-note">
          ✦ الدفع عند الاستلام.<br>
          ✦ ${esc(config.shipping_note || 'راجعي تفاصيل التوصيل قبل تأكيد الطلب.')}
        </p>
      </div>
    </div>
  `;

  const modal = $('#productModal');
  if (modal) modal.showModal();

  if (window.BTracking) {
    BTracking.event('view_item', {
      currency: 'EGP',
      value: p.price / 100,
      items: analyticsItems([p])
    }, 'ViewContent');
  }
}

function renderCart() {
  const list = items().map(r => ({
    ...products.find(p => p.id === r.id),
    quantity: r.quantity
  })).filter(p => p.id);

  const sum = list.reduce((n, p) => n + p.quantity * p.price, 0);

  // Free shipping progress calculation
  const fsBar = $('#freeShippingBar');
  const fsText = $('#fsText');
  const fsProgress = $('#fsProgress');

  if (fsBar && config.free_shipping > 0) {
    fsBar.hidden = false;
    const needed = config.free_shipping - sum;
    if (needed > 0) {
      const pct = Math.min(100, Math.round((sum / config.free_shipping) * 100));
      fsText.innerHTML = `فاضلك <strong>${money(needed)}</strong> على الشحن المجاني! 🚚`;
      fsProgress.style.width = pct + '%';
    } else {
      fsText.innerHTML = `مبروك! طلبك مؤهل لـ <strong>الشحن المجاني</strong> 🎉`;
      fsProgress.style.width = '100%';
    }
  } else if (fsBar) {
    fsBar.hidden = true;
  }

  // Cart items
  const itemsContainer = $('#cartItems');
  if (itemsContainer) {
    itemsContainer.innerHTML = list.map(p => `
      <div class="cart-item-row">
        <img src="${esc(p.images[0])}" alt="${esc(p.name)}">
        <div class="cart-item-details">
          <h4>${esc(p.name)}</h4>
          <div class="cart-item-price">${money(p.price)}</div>
          <div class="qty-control">
            <button data-qty="${esc(p.id)}" data-delta="-1" aria-label="تقليل الكمية">−</button>
            <span>${p.quantity}</span>
            <button data-qty="${esc(p.id)}" data-delta="1" aria-label="زيادة الكمية">+</button>
            <button class="cart-remove-btn" data-remove="${esc(p.id)}">حذف</button>
          </div>
        </div>
      </div>
    `).join('') || `
      <div class="empty-state" style="padding: 50px 10px;">
        <span style="font-size: 45px; color: var(--hot);">♡</span>
        <strong>شنطتك مستنية أول قطعة!</strong>
        <p>اختاري إكسسوارات تليق بيكي ونوصّلها لباب بيتك.</p>
      </div>
    `;
  }

  // Cart Footer
  const footerContainer = $('#cartFooter');
  if (footerContainer) {
    footerContainer.innerHTML = list.length ? `
      <div class="subtotal-row">
        <span>إجمالي القطع</span>
        <b dir="ltr">${money(sum)}</b>
      </div>
      <button class="btn primary-dark checkout-trigger-btn" id="checkoutOpen">
        <span>متابعة إتمام الطلب ↗</span>
      </button>
      <p class="drawer-trust-caption">
        الدفع عند الاستلام • الشحن والمصاريف النهائية في الخطوة القادمة
      </p>
    ` : '';
  }

  const checkoutBtn = $('#checkoutOpen');
  if (checkoutBtn) checkoutBtn.onclick = checkout;
}

function renderLook(shuffle = false) {
  const available = products.filter(p => p.stock > 0);
  let selected = [];

  if (mood === 'soft') {
    selected = available.filter(p => /Pink|Crystal|Circle|Petal|Heart|Flora/i.test(p.name_en || ''));
  } else if (mood === 'bold') {
    selected = available.filter(p => /Wrap|Wave|Layer|Soleil|Clover/i.test(p.name_en || ''));
  } else {
    selected = available.filter(p => /Classic|Two-Tone|Charm|Bangle|Flora/i.test(p.name_en || ''));
  }

  if (shuffle) selected = [...selected].sort(() => Math.random() - 0.5);

  look = [];
  // Pick from different categories
  for (const p of selected) {
    if (!look.some(x => x.category_id === p.category_id) && look.length < 3) {
      look.push(p);
    }
  }
  // Fallback to any available if needed
  for (const p of available) {
    if (look.length < 3 && !look.some(x => x.id === p.id)) {
      look.push(p);
    }
  }

  const lookItemsEl = $('#lookItems');
  if (lookItemsEl) {
    lookItemsEl.innerHTML = look.map(p => `
      <button type="button" class="look-item-card" data-product="${esc(p.id)}" aria-label="عرض ${esc(p.name)}">
        <img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">
        <b>${esc(p.name)}</b>
        <span>${money(p.price)}</span>
      </button>
    `).join('') || '<p class="empty-state">التنسيقات راجعة قريب ♡</p>';
  }

  const total = look.reduce((n, p) => n + p.price, 0);
  if ($('#lookTotal')) $('#lookTotal').textContent = money(total);
  if ($('#addLook')) $('#addLook').disabled = !look.length;

  $$('[data-mood]').forEach(b => {
    b.classList.toggle('active', b.dataset.mood === mood);
  });
}

async function refreshQuote() {
  quoteData = null;
  const placeBtn = $('#placeOrder');
  const errEl = $('#checkoutError');
  const sumEl = $('#checkoutSummary');

  if (placeBtn) placeBtn.disabled = true;
  if (errEl) errEl.textContent = '';

  try {
    quoteData = await api('quote', { items: items(), coupon });
    if (sumEl) {
      sumEl.innerHTML = [
        ['إجمالي القطع', quoteData.subtotal],
        ['خصم الكوبون', -quoteData.discount],
        ['مصاريف الشحن', quoteData.shipping],
        ['الإجمالي للدفع عند الاستلام', quoteData.total]
      ].map(([label, val], idx) => `
        <div class="summary-line ${idx === 3 ? 'total' : ''}">
          <span>${label}</span>
          <b dir="ltr">${money(val)}</b>
        </div>
      `).join('');
    }
    if (placeBtn) placeBtn.disabled = false;
  } catch (e) {
    if (errEl) errEl.textContent = e.message;
    if (sumEl) sumEl.innerHTML = '';
  }
}

async function checkout() {
  if (!items().length) return;
  const cartModal = $('#cartModal');
  if (cartModal) cartModal.close();

  const chkModal = $('#checkoutModal');
  if (chkModal) chkModal.showModal();

  await refreshQuote();

  if (quoteData && window.BTracking) {
    BTracking.event('begin_checkout', {
      currency: 'EGP',
      value: quoteData.total / 100,
      items: analyticsItems(quoteData.items)
    }, 'InitiateCheckout');
  }
}

function orderKey() {
  try {
    let k = sessionStorage.getItem('b-order-key');
    if (!k) {
      k = crypto.randomUUID();
      sessionStorage.setItem('b-order-key', k);
    }
    return k;
  } catch {
    return crypto.randomUUID();
  }
}

function attribution() {
  const out = {};
  if (!window.BTracking || !BTracking.consent()) return out;
  try {
    Object.assign(out, JSON.parse(sessionStorage.getItem('b-attribution') || '{}'));
  } catch {}
  const u = new URL(location.href);
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid']) {
    if (u.searchParams.has(k)) out[k] = u.searchParams.get(k);
  }
  try {
    sessionStorage.setItem('b-attribution', JSON.stringify(out));
  } catch {}
  return out;
}

// Checkout form submission
const chkForm = $('#checkoutForm');
if (chkForm) {
  chkForm.onsubmit = async e => {
    e.preventDefault();
    if (submitting || !quoteData) return;
    submitting = true;

    const placeBtn = $('#placeOrder');
    const errEl = $('#checkoutError');
    if (placeBtn) placeBtn.disabled = true;
    if (errEl) errEl.textContent = '';

    try {
      const formObj = Object.fromEntries(new FormData(e.target));
      const orderRes = await api('orders', {
        ...formObj,
        items: items(),
        coupon,
        expected_total: quoteData.total,
        idempotency: orderKey(),
        consent: window.BTracking ? BTracking.consent() : false,
        attribution: attribution()
      });

      $('#checkoutModal')?.close();
      bag = {};
      coupon = '';
      e.target.reset();
      save();

      try {
        sessionStorage.removeItem('b-order-key');
        localStorage.setItem('b-last-order', JSON.stringify({
          code: orderRes.code,
          token: orderRes.token || ''
        }));
      } catch {}

      // Confirmation Screen
      const receiptContent = $('#receiptContent');
      if (receiptContent) {
        receiptContent.innerHTML = `
          <div class="receipt-icon">♡</div>
          <p class="drawer-eyebrow">IT’S THE START OF A LITTLE STORY</p>
          <h2 style="font-size: 26px; margin-bottom: 8px;">تم استلام طلبك بنجاح!</h2>
          <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
            ${esc(config.shipping_note || 'هنتواصل معاكي في أقرب وقت لتأكيد موعد التوصيل.')}
          </p>

          <div class="receipt-code-box">
            <span style="display: block; font-size: 11px; color: var(--muted); margin-bottom: 4px;">رقم الطلب</span>
            <div class="receipt-code-num">${esc(orderRes.code)}</div>
          </div>

          <p style="font-size: 15px; font-weight: 600;">
            المبلغ المطلوب: <b>${money(orderRes.total)}</b> (الدفع عند الاستلام)
          </p>

          ${orderRes.token ? `
            <p style="font-size: 12px; color: var(--muted); margin-top: 14px;">
              كود التتبع السري الخاص بشحنتك (احتفظي بيه لمتابعة خط سير الطلب):
            </p>
            <div class="receipt-token-box">${esc(orderRes.token)}</div>
          ` : ''}

          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button class="btn primary-dark" id="receiptDownload" style="flex: 1;">
              حفظ بيانات الطلب 📥
            </button>
            <a href="${esc(config.instagram || 'https://www.instagram.com/b_acc.eg/')}"
               target="_blank" rel="noopener" class="btn outline-pill" style="display: inline-flex; align-items: center;">
              تواصلي مع البراند
            </a>
          </div>
        `;
      }

      const receiptModal = $('#receiptModal');
      if (receiptModal) receiptModal.showModal();

      const dlBtn = $('#receiptDownload');
      if (dlBtn) {
        dlBtn.onclick = () => {
          const txt = `B Accessories — تأكيد الطلب\nرقم الطلب: ${orderRes.code}\nكود التتبع: ${orderRes.token || 'تواصل مع البراند'}\nالمبلغ المستحق: ${money(orderRes.total)}\nطريقة الدفع: كاش عند الاستلام`;
          const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = orderRes.code + '.txt';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 500);
        };
      }

      if (!orderRes.replayed && window.BTracking) {
        BTracking.event('purchase', {
          transaction_id: orderRes.code,
          currency: 'EGP',
          value: (orderRes.subtotal - orderRes.discount) / 100,
          shipping: orderRes.shipping / 100,
          items: analyticsItems(orderRes.items)
        }, 'Lead', orderRes.id + ':Lead');
      }

      // Refresh catalog
      const refreshed = await api('catalog');
      products = refreshed.products;
      render();
      renderLook();
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    } finally {
      submitting = false;
      if (placeBtn) placeBtn.disabled = false;
    }
  };
}

function trackOpen() {
  const last = read('b-last-order', {});
  const form = $('#trackForm');
  if (form) {
    if (form.elements.code) form.elements.code.value = last.code || '';
    if (form.elements.token) form.elements.token.value = last.token || '';
  }
  const modal = $('#trackModal');
  if (modal) modal.showModal();
}

const statusNames = {
  new: 'طلب جديد تم تسجيله',
  confirmed: 'تم التأكيد وجاري التجهيز',
  shipped: 'في الطريق مع مندوب الشحن',
  delivered: 'تم التسليم بنجاح',
  cancelled: 'طلب ملغي',
  returned: 'مرتجع'
};

const trackForm = $('#trackForm');
if (trackForm) {
  trackForm.onsubmit = async e => {
    e.preventDefault();
    const errEl = $('#trackError');
    const resEl = $('#trackResult');
    if (errEl) errEl.textContent = '';
    if (resEl) resEl.innerHTML = '';

    try {
      const o = await api('track', Object.fromEntries(new FormData(e.target)));
      if (resEl) {
        resEl.innerHTML = `
          <div style="margin: 20px 0;">
            <span class="status-badge-pill">${statusNames[o.status] || o.status}</span>
          </div>
          <div class="track-timeline">
            ${o.events.map(ev => `
              <div class="track-event">
                <b>${statusNames[ev.status] || ev.status}</b>
                <span dir="ltr">${new Date(ev.created_at).toLocaleDateString('ar-EG')}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    }
  };
}

// Global Click Delegation
document.addEventListener('click', e => {
  const b = e.target.closest('button, a');
  if (!b) return;

  // Dialog Close buttons
  if (b.dataset.close) {
    const d = document.getElementById(b.dataset.close);
    if (d) d.close();
  }

  // Category filters
  if (b.dataset.cat) changeFilter(b.dataset.cat);
  if (b.dataset.filter) changeFilter(b.dataset.filter);

  // Product modal trigger
  if (b.dataset.product) {
    e.preventDefault();
    openProduct(b.dataset.product);
  }

  // Add to Bag
  if (b.dataset.add) {
    e.preventDefault();
    add(b.dataset.add);
  }

  // Gallery image swap
  if (b.dataset.img) {
    const mainImg = $('#detailMainImg');
    if (mainImg) mainImg.src = b.dataset.img;
    $$('.detail-thumb-btn').forEach(btn => btn.classList.toggle('active', btn === b));
  }

  // Wishlist toggle
  if (b.dataset.wish || b.dataset.detailWish) {
    e.preventDefault();
    const pid = b.dataset.wish || b.dataset.detailWish;
    if (wish.includes(pid)) {
      wish = wish.filter(x => x !== pid);
      toast('اتمسحت من المفضلة ♡');
    } else {
      wish.push(pid);
      toast('اتضافت لقائمة أمنياتك ♥');
    }
    save();
    render();
    if (b.dataset.detailWish) {
      b.textContent = wish.includes(pid) ? 'محفوظة في قائمة أمنياتك ♥' : 'احفظيها في المفضلة ♡';
    }
  }

  // Cart item remove
  if (b.dataset.remove) {
    delete bag[b.dataset.remove];
    save();
    renderCart();
  }

  // Cart item quantity update
  if (b.dataset.qty) {
    const pid = b.dataset.qty;
    const p = products.find(x => x.id === pid);
    if (!p) return;
    const cur = bag[pid] || 0;
    const delta = Number(b.dataset.delta);
    const nxt = cur + delta;

    if (nxt > Math.min(p.stock, 20)) return toast('دي أقصى كمية متاحة من القطعة');
    if (nxt <= 0) delete bag[pid];
    else bag[pid] = nxt;

    save();
    renderCart();
  }

  // Mood switch
  if (b.dataset.mood) {
    mood = b.dataset.mood;
    renderLook();
  }
});

// Controls & Triggers
if ($('#sort')) $('#sort').onchange = render;
if ($('#inStock')) $('#inStock').onchange = render;
if ($('#search')) $('#search').oninput = render;

if ($('#searchButton')) {
  $('#searchButton').onclick = () => {
    const sInput = $('#search');
    if (sInput) {
      $('#shop')?.scrollIntoView({ behavior: 'smooth' });
      sInput.focus();
    }
  };
}

if ($('#resetFilters')) $('#resetFilters').onclick = resetAllFilters;

if ($('#wishButton')) {
  $('#wishButton').onclick = () => {
    favorites = !favorites;
    filter = 'all';
    if ($('#search')) $('#search').value = '';
    if ($('#inStock')) $('#inStock').checked = false;
    render();
    $('#shop')?.scrollIntoView({ behavior: 'smooth' });
  };
}

if ($('#mobileWishBtn')) {
  $('#mobileWishBtn').onclick = () => {
    favorites = !favorites;
    filter = 'all';
    if ($('#search')) $('#search').value = '';
    if ($('#inStock')) $('#inStock').checked = false;
    render();
    $('#shop')?.scrollIntoView({ behavior: 'smooth' });
  };
}

if ($('#cartButton')) {
  $('#cartButton').onclick = () => {
    renderCart();
    $('#cartModal')?.showModal();
  };
}

if ($('#mobileCartBtn')) {
  $('#mobileCartBtn').onclick = () => {
    renderCart();
    $('#cartModal')?.showModal();
  };
}

if ($('#shuffleLook')) $('#shuffleLook').onclick = () => renderLook(true);

if ($('#addLook')) {
  $('#addLook').onclick = () => {
    if (!look.length) return;
    if (look.some(p => (bag[p.id] || 0) >= Math.min(p.stock, 20))) {
      toast('راجعي كميات الشنطة؛ قطعة من التنسيقة وصلت لأقصى كمية متاحة.');
      return;
    }
    look.forEach(p => add(p.id, true));
    toast('التنسيقة كاملة اتضافت لشنطتك! ♡');
    renderCart();
    $('#cartModal')?.showModal();
  };
}

if ($('#applyCoupon')) {
  $('#applyCoupon').onclick = () => {
    coupon = ($('#couponInput')?.value || '').trim().toUpperCase();
    refreshQuote();
  };
}

if ($('#trackOpen')) $('#trackOpen').onclick = trackOpen;
if ($('#footerTrack')) $('#footerTrack').onclick = trackOpen;
if ($('#mobileTrackBtn')) {
  $('#mobileTrackBtn').onclick = () => {
    closeMenu();
    trackOpen();
  };
}

if ($('#cookieSettings')) {
  $('#cookieSettings').onclick = () => {
    if ($('#cookieBanner')) $('#cookieBanner').hidden = false;
  };
}

// Mobile drawer open/close
const menuToggle = $('#menuToggle');
const drawerClose = $('#drawerClose');
const mobileDrawer = $('#mobileDrawer');
function closeMenu() {
  mobileDrawer?.classList.remove('open');
  mobileDrawer?.setAttribute('aria-hidden', 'true');
  if (mobileDrawer) mobileDrawer.inert = true;
  menuToggle?.setAttribute('aria-expanded', 'false');
}
if (mobileDrawer) mobileDrawer.inert = true;

if (menuToggle && mobileDrawer) {
  menuToggle.onclick = () => {
    mobileDrawer.classList.add('open');
    mobileDrawer.inert = false;
    mobileDrawer.setAttribute('aria-hidden', 'false');
    menuToggle.setAttribute('aria-expanded', 'true');
    drawerClose?.focus();
  };
}

if (drawerClose && mobileDrawer) {
  drawerClose.onclick = () => {
    closeMenu();
    menuToggle?.focus();
  };
}

$$('.mobile-nav-link').forEach(link => {
  link.addEventListener('click', () => {
    closeMenu();
  });
});
document.addEventListener('keydown', e => {
  if (!mobileDrawer?.classList.contains('open')) return;
  if (e.key === 'Escape') { closeMenu(); menuToggle?.focus(); }
  if (e.key === 'Tab') {
    const focusable = [...mobileDrawer.querySelectorAll('button, a[href]')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
});

// Consent management
function consent(yes) {
  try {
    localStorage.setItem('b-consent', yes ? 'yes' : 'no');
  } catch {}
  if ($('#cookieBanner')) $('#cookieBanner').hidden = true;

  if (yes && window.BTracking) {
    BTracking.load();
    attribution();
  } else if (!yes && window.gtag) {
    gtag('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  }
  if (!yes && window.fbq) location.reload();
}

if ($('#acceptCookies')) $('#acceptCookies').onclick = () => consent(true);
if ($('#rejectCookies')) $('#rejectCookies').onclick = () => consent(false);

// Backdrop click closes dialogs
document.querySelectorAll('dialog').forEach(d => {
  d.addEventListener('click', e => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        d.close();
      }
    }
  });
});

// Header scroll elevation
window.addEventListener('scroll', () => {
  const hdr = $('#siteHeader');
  if (hdr) hdr.classList.toggle('scrolled', window.scrollY > 30);
}, { passive: true });

// Shared bridge for the interactive experiences (play.js).
// The experiences reuse the existing catalog, cart, wishlist and analytics
// instead of keeping their own product lists or cart.
window.BStore = {
  get products() { return products; },
  get categories() { return categories; },
  get config() { return config; },
  get wish() { return wish; },
  ready: false,
  money,
  esc,
  toast,
  api,
  add,
  save,
  renderCart,
  addItem(id, quiet = true) { add(id, quiet); },
  openCart() { renderCart(); $('#cartModal')?.showModal(); },
  quantityInBag(id) { return bag[id] || 0; },
  maxQuantity: p => Math.min(p.stock, 20),
  available: () => products.filter(p => p.stock > 0),
  track(name, data = {}, metaName) {
    if (window.BTracking) BTracking.event(name, data, metaName);
  },
  trackItems(ps) { return analyticsItems(ps); }
};

// Application Boot
(async () => {
  try {
    const d = await api('catalog');
    products = d.products;
    categories = d.categories;
    config = d.settings;

    // Clean up bag and wish
    bag = Object.fromEntries(items().map(r => [r.id, r.quantity]));
    wish = wish.filter(id => products.some(p => p.id === id));
    save();

    if ($('#demoBar')) $('#demoBar').hidden = !d.demo;
    if ($('#headline')) $('#headline').textContent = config.headline;
    if ($('#subline')) $('#subline').textContent = config.subline;
    const heroProduct = products.find(p => p.id === 'Accessories-53');
    if ($('.card-price')) $('.card-price').textContent = heroProduct ? money(heroProduct.price) : 'B ACCESSORIES';
    if ($('#policyText')) $('#policyText').textContent = config.policy;
    if ($('#checkoutPolicy')) $('#checkoutPolicy').textContent = (config.policy || '') + '\n\n' + (config.shipping_note || '');
    if ($('#shippingFaq')) {
      $('#shippingFaq').textContent = `الشحن ${money(config.shipping)}${config.free_shipping ? `، ومجاني للطلبات فوق ${money(config.free_shipping)}.` : '.'}`;
    }

    // Populate governorates
    const govSelect = $('#governorate');
    if (govSelect && config.governorates) {
      govSelect.innerHTML = '<option value="">اختاري المحافظة</option>' +
        config.governorates.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    }

    // Set Instagram links
    $$('.insta-link').forEach(a => {
      if (config.instagram) a.href = config.instagram;
    });

    if (window.BTracking) {
      BTracking.configure(config);
      attribution();
    }

    if (!localStorage.getItem('b-consent') && $('#cookieBanner')) {
      $('#cookieBanner').hidden = false;
    }

    render();
    renderLook();

    // Check query params for direct product open
    const selected = new URL(location.href).searchParams.get('product');
    if (selected) openProduct(selected);

    // Scroll reveal observer
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });

    $$('.section-head, .edit-card, .story-img-card, .story-content, .stylist-intro, .trust-item').forEach(el => {
      el.classList.add('reveal');
      obs.observe(el);
    });

    window.BStore.ready = true;
    window.BStore.products = products; // للـ TryOn module
    window.BStore.addToBag = (id) => add(id, false); // helper للـ TryOn
    window.dispatchEvent(new CustomEvent('bstore:ready'));

  } catch (err) {
    window.dispatchEvent(new CustomEvent('bstore:error', { detail: err.message }));
    const productsEl = $('#products');
    if (productsEl) {
      productsEl.innerHTML = `
        <div class="empty-state">
          <p>${esc(err.message)}</p>
          <p>حدّثي الصفحة أو تواصلي مع البراند للاستفسار.</p>
        </div>
      `;
    }
  }
})();

/* ═══════════════════════════════════════════════════════════════
   ✨ Virtual Try-On Module — B Accessories v2.2
   يُضاف على موديول المتجر الرئيسي
═══════════════════════════════════════════════════════════════ */
(function TryOnModule() {
  // State
  let tryOnEnabled = false;
  let currentProduct = null;
  let selectedFile = null;
  let selectedBase64 = null;

  // Elements
  const modal = () => $('#tryOnModal');
  const uploadZone = () => $('#tryOnUploadZone');
  const fileInput = () => $('#tryOnFileInput');
  const placeholder = () => $('#tryOnPlaceholder');
  const previewImg = () => $('#tryOnPreviewImg');
  const btn = () => $('#tryOnBtn');
  const btnText = () => $('#tryOnBtnText');
  const loadingEl = () => $('#tryOnLoading');
  const resultEl = () => $('#tryOnResult');
  const resultImg = () => $('#tryOnResultImg');
  const errorEl = () => $('#tryOnError');
  const downloadBtn = () => $('#tryOnDownloadBtn');
  const addToCartBtn = () => $('#tryOnAddToCart');

  // ── التحقق من تفعيل الميزة ────────────────────────────────────────────────
  async function checkEnabled() {
    try {
      const r = await fetch('/api/try-on-status');
      const data = await r.json();
      tryOnEnabled = data.enabled === true;
    } catch {
      tryOnEnabled = false;
    }
  }

  // ── تحويل File لـ base64 ─────────────────────────────────────────────────
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result.split(',')[1]); // بدون data: prefix
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── تحديث الـ UI ──────────────────────────────────────────────────────────
  function setError(msg) {
    const el = errorEl();
    if (el) { el.textContent = msg; el.hidden = !msg; }
  }

  function showLoading(show) {
    const el = loadingEl();
    if (el) el.hidden = !show;
  }

  function showResult(show) {
    const el = resultEl();
    if (el) el.hidden = !show;
  }

  function resetState() {
    setError('');
    showLoading(false);
    showResult(false);
    selectedFile = null;
    selectedBase64 = null;

    const pi = previewImg();
    const ph = placeholder();
    if (pi) pi.hidden = true;
    if (ph) ph.hidden = false;

    updateBtn();
  }

  function updateBtn() {
    const b = btn();
    const bt = btnText();
    if (!b || !bt) return;
    if (!selectedBase64) {
      b.disabled = true;
      bt.textContent = 'اختاري صورتكِ أولاً';
    } else {
      b.disabled = false;
      bt.textContent = 'جربي القطعة عليكِ ✨';
    }
  }

  // ── عرض معلومات المنتج في المودال ────────────────────────────────────────
  function renderProductPreview(product) {
    const container = $('#tryOnProductPreview');
    if (!container || !product) return;

    const imgSrc = product.images?.[0] || '';
    container.innerHTML = `
      <img src="${esc(imgSrc)}" alt="${esc(product.name)}" onerror="this.style.display='none'">
      <div>
        <div class="tryon-product-name">${esc(product.name)}</div>
        <div class="tryon-product-price">${money(product.price)}</div>
      </div>
    `;
  }

  // ── معالجة اختيار الصورة ─────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return;

    // التحقق من الحجم (10 ميجا)
    if (file.size > 10 * 1024 * 1024) {
      setError('الصورة كبيرة جداً — الحد الأقصى 10 ميجابايت');
      return;
    }

    // التحقق من النوع
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('نوع الصورة غير مدعوم — ارفعي JPG أو PNG أو WebP');
      return;
    }

    setError('');
    selectedFile = file;

    // عرض المعاينة
    const url = URL.createObjectURL(file);
    const pi = previewImg();
    const ph = placeholder();
    if (pi) { pi.src = url; pi.hidden = false; }
    if (ph) ph.hidden = true;

    // تحويل لـ base64
    try {
      selectedBase64 = await fileToBase64(file);
      updateBtn();
    } catch {
      setError('فشل قراءة الصورة، جربي صورة تانية');
    }
  }

  // ── استدعاء Try-On API ────────────────────────────────────────────────────
  async function runTryOn() {
    if (!currentProduct || !selectedBase64) return;

    setError('');
    showLoading(true);
    showResult(false);
    const b = btn();
    if (b) b.disabled = true;

    try {
      const r = await fetch('/api/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: currentProduct.id,
          image_base64: selectedBase64,
          category: 'accessories',
        }),
      });

      const data = await r.json();

      if (!r.ok) {
        setError(data.error || 'حصل خطأ، جربي مرة تانية');
        showLoading(false);
        if (b) b.disabled = false;
        return;
      }

      // عرض النتيجة
      showLoading(false);
      showResult(true);

      const ri = resultImg();
      if (ri) ri.src = data.result_url;

      // زر التحميل
      const dl = downloadBtn();
      if (dl) dl.href = data.result_url;

      // scroll للنتيجة
      setTimeout(() => resultEl()?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);

    } catch (err) {
      showLoading(false);
      setError('مشكلة في الاتصال، تأكدي من الإنترنت وجربي تاني');
      if (b) b.disabled = false;
    }
  }

  // ── فتح المودال لمنتج معين ────────────────────────────────────────────────
  function openForProduct(product) {
    if (!tryOnEnabled) {
      // لو مش مفعّل، نوضّح للمستخدم
      alert('خاصية التجربة بالذكاء الاصطناعي غير متاحة حالياً.');
      return;
    }

    currentProduct = product;
    resetState();
    renderProductPreview(product);

    const m = modal();
    if (m && !m.open) m.showModal();
  }

  // ── Event Listeners ───────────────────────────────────────────────────────
  function initListeners() {
    // فتح file picker عند الضغط على منطقة الرفع
    document.addEventListener('click', e => {
      const zone = e.target.closest('#tryOnUploadZone');
      if (zone) fileInput()?.click();

      // زر "جربي القطعة" في modal المنتج
      const triggerBtn = e.target.closest('.tryon-trigger-btn');
      if (triggerBtn) {
        const pid = triggerBtn.dataset.productId;
        const product = window.BStore?.products?.find(p => p.id === pid);
        if (product) openForProduct(product);
      }

      // زر "أضيفيها للشنطة" بعد النتيجة
      if (e.target.closest('#tryOnAddToCart') && currentProduct) {
        // إضافة للسلة — نستدعي دالة المتجر لو موجودة
        if (window.BStore?.addToBag) {
          window.BStore.addToBag(currentProduct.id, 1);
        }
        modal()?.close();
      }
    });

    // اختيار ملف
    document.addEventListener('change', e => {
      if (e.target.id === 'tryOnFileInput' && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    });

    // Drag & Drop
    document.addEventListener('dragover', e => {
      if (e.target.closest('#tryOnUploadZone')) {
        e.preventDefault();
        e.target.closest('#tryOnUploadZone').classList.add('dragover');
      }
    });

    document.addEventListener('dragleave', e => {
      if (e.target.closest('#tryOnUploadZone')) {
        e.target.closest('#tryOnUploadZone').classList.remove('dragover');
      }
    });

    document.addEventListener('drop', e => {
      const zone = e.target.closest('#tryOnUploadZone');
      if (zone) {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }
    });

    // زر "جربي"
    document.addEventListener('click', e => {
      if (e.target.closest('#tryOnBtn')) runTryOn();
    });

    // إغلاق المودال
    document.addEventListener('click', e => {
      const closeBtn = e.target.closest('[data-close="tryOnModal"]');
      if (closeBtn) modal()?.close();
    });
  }

  // ── تصدير الـ API للمتجر ──────────────────────────────────────────────────
  window.BTryOn = { open: openForProduct };

  // ── Init ──────────────────────────────────────────────────────────────────
  checkEnabled();
  initListeners();

})(); // end TryOnModule
