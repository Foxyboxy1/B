/* B Accessories — Interactive Shopping Experiences (Play & Discover)
   All three experiences read the same live catalog, cart and analytics through
   the shared bridge exposed by store.js (window.BStore). No duplicated
   product lists, no second cart. */
(() => {
  'use strict';

  let B = null;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const money = n => B.money(n);
  const esc = v => B.esc(v);
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =======================================================================
     Shared catalog helpers
     The store catalog has no style/tone attributes, so a maintainable
     keyword mapping derives them from the real product names.
     ======================================================================= */
  const STYLES = [
    { id: 'minimal', name: 'مينيمال', en: 'Minimal', words: ['classic', 'plain', 'simple', 'thin', 'circle', 'mini', 'two-tone', 'screw'] },
    { id: 'elegant', name: 'إليجانت', en: 'Elegant', words: ['crystal', 'pearl', 'halo', 'clover', 'vine', 'flora', 'layered', 'chain'] },
    { id: 'romantic', name: 'رومانسي', en: 'Romantic', words: ['pink', 'heart', 'petal', 'rose', 'flora', 'flower', 'pearl'] },
    { id: 'bold', name: 'جريء', en: 'Bold', words: ['chunky', 'dome', 'wrap', 'triple', 'statement', 'set', 'hammered', 'abstract'] },
    { id: 'night', name: 'نايت آوت', en: 'Night Out', words: ['crystal', 'halo', 'sparkle', 'statement', 'gold'] },
    { id: 'everyday', name: 'كل يوم', en: 'Everyday', words: ['bangle', 'screw', 'classic', 'daily', 'chain', 'mini', 'set'] }
  ];

  const TONES = [
    { id: 'gold', name: 'ذهبي', color: '#d9a95f' },
    { id: 'silver', name: 'فضي', color: '#c8ccd3' }
  ];

  function haystack(p) {
    return ((p.name_en || '') + ' ' + (p.name || '')).toLowerCase();
  }

  function styleScore(p) {
    const text = haystack(p);
    const out = {};
    for (const s of STYLES) {
      let n = 0;
      for (const w of s.words) if (text.includes(w)) n++;
      if (n) out[s.id] = Math.min(n, 3);
    }
    return out;
  }

  function tonesOf(p) {
    const text = haystack(p);
    const set = new Set();
    if (text.includes('gold')) set.add('gold');
    if (text.includes('silver')) set.add('silver');
    if (text.includes('pink') || text.includes('rose')) set.add('pink');
    if (!set.size) set.add('gold');
    return set;
  }

  function toneLabel(p) {
    const t = tonesOf(p);
    if (t.has('gold') && t.has('silver')) return 'ذهبي وفضي';
    if (t.has('gold')) return 'ذهبي';
    if (t.has('silver')) return 'فضي';
    return 'وردي';
  }

  function categoryName(id) {
    return (B.categories.find(c => c.id === id) || {}).name || id;
  }

  function byId(id) {
    return B.products.find(p => p.id === id);
  }

  /* Stable, repeatable pseudo random generator so the same choices always
     produce the same box / recommendation set. */
  function seedFrom(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* =======================================================================
     Shared UI helpers
     ======================================================================= */
  function alertBox(kind, html) {
    const icon = kind === 'error' ? '!' : kind === 'warn' ? '✦' : '♡';
    return `<div class="play-alert ${kind || ''}"><i aria-hidden="true">${icon}</i><div>${html}</div></div>`;
  }

  function productCard(p, opts = {}) {
    const isActive = !!opts.active;
    return `
      <button class="play-product ${isActive ? 'active' : ''}"
              data-pick="${esc(p.id)}"
              aria-pressed="${isActive ? 'true' : 'false'}"
              ${p.stock ? '' : 'disabled'}>
        ${p.stock ? '' : '<span class="tag">نفدت</span>'}
        ${opts.badge ? `<span class="tag">${esc(opts.badge)}</span>` : ''}
        <img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy" decoding="async">
        <b>${esc(p.name)}</b>
        <span>${money(p.price)}</span>
      </button>
    `;
  }

  function addToBag(products, source, quiet) {
    const usable = products.filter(p => p && p.stock > 0);
    if (!usable.length) {
      B.toast('مفيش قطع متوفرة من الاختيار ده حالياً');
      return 0;
    }
    let added = 0;
    for (const p of usable) {
      if (B.quantityInBag(p.id) >= B.maxQuantity(p)) continue;
      B.addItem(p.id, true);
      added++;
    }
    B.save();
    if (!quiet) {
      B.toast(added ? `اتضافت ${added} قطعة لشنطتك ♡` : 'القطع دي موجودة بالكمية المتاحة بالفعل في شنطتك');
    }
    if (added) {
      B.track('interactive_experience_purchase', {
        currency: 'EGP',
        value: usable.reduce((n, p) => n + p.price, 0) / 100,
        items: B.trackItems(usable),
        source
      }, 'AddToCart');
    }
    B.openCart();
    return added;
  }

  /* =======================================================================
     Feature 1 — Butterflies and scroll-driven motion
     ======================================================================= */
  const BUTTERFLY_SVG = `
    <svg viewBox="0 0 60 50" aria-hidden="true">
      <g class="wing wing-left" fill="currentColor" opacity="0.85">
        <path d="M29 24C22 12 12 4 6 8c-6 4-3 16 4 18-7 3-8 14-1 17 6 2 14-5 20-16z"/>
      </g>
      <g class="wing wing-right" fill="currentColor" opacity="0.85">
        <path d="M31 24c7-12 17-20 23-16 6 4 3 16-4 18 7 3 8 14 1 17-6 2-14-5-20-16z"/>
      </g>
      <ellipse cx="30" cy="26" rx="2.4" ry="9" fill="#40282e" opacity="0.75"/>
      <path d="M30 18c-2-4-5-6-7-7M30 18c2-4 5-6 7-7" stroke="#40282e" stroke-width="1.2" fill="none" opacity="0.6"/>
    </svg>`;

  function initButterflies() {
    if ($('.butterfly-layer')) return;
    const layer = document.createElement('div');
    layer.className = 'butterfly-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    const anchors = [
      { el: $('.hero-collage'), x: 0.8, y: 0.12 },
      { el: $('.hero-collage'), x: 0.05, y: 0.7 },
      { el: $('#shop'), x: 0.9, y: 0.16 },
      { el: $('#play'), x: 0.08, y: 0.22 },
      { el: $('#stylist'), x: 0.88, y: 0.32 }
    ].filter(a => a.el);

    if (!anchors.length) return;

    const colors = ['#e69aa3', '#bd2b58', '#c69a5a', '#d98ca6', '#a9668f'];
    const reduced = reduceMotion();
    const mobile = window.matchMedia('(max-width: 650px)').matches;
    const total = reduced ? 3 : mobile ? 3 : 5;
    const flock = [];

    for (let i = 0; i < total; i++) {
      const anchor = anchors[i % anchors.length];
      const el = document.createElement('div');
      el.className = 'butterfly';
      el.style.color = colors[i % colors.length];
      const size = 38 + i * 7;
      el.style.width = size + 'px';
      el.style.height = Math.round(size * 0.86) + 'px';
      el.innerHTML = BUTTERFLY_SVG;
      layer.appendChild(el);
      flock.push({
        el, anchor,
        phase: (i * 2.1) % (Math.PI * 2),
        speed: 0.0004 + i * 0.00007,
        ax: 18 + i * 5,
        ay: 14 + i * 4,
        rot: 8 + i * 2,
        par: 0.05 + i * 0.012,
        scale: 0.9 + i * 0.06
      });
    }

    // A roaming butterfly crosses the viewport while travelling down the page,
    // so scrolling always carries motion with it.
    if (!reduced) {
      const el = document.createElement('div');
      el.className = 'butterfly is-roamer';
      el.style.color = '#bd2b58';
      el.style.width = '62px';
      el.style.height = '54px';
      el.innerHTML = BUTTERFLY_SVG;
      layer.appendChild(el);
      flock.push({ el, roamer: true, phase: 1.1 });
    }

    const place = (b, time, velocity) => {
      if (b.roamer) {
        const span = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const p = Math.min(1, Math.max(0, window.scrollY / span));
        const x = window.innerWidth * (0.1 + 0.8 * (0.5 + 0.5 * Math.sin(p * Math.PI * 2.6 + time / 2400)));
        const y = 84 + p * Math.max(140, window.innerHeight - 170) + Math.sin(time / 620) * 16;
        const rotate = Math.sin(p * Math.PI * 4 + time / 900) * 16;
        b.el.classList.add('is-ready');
        b.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rotate.toFixed(1)}deg)`;
        return;
      }
      const rect = b.anchor.el.getBoundingClientRect();
      const visible = rect.bottom > -160 && rect.top < window.innerHeight + 160;
      b.el.style.opacity = visible ? '' : '0';
      if (!visible) {
        b.el.classList.remove('is-ready');
        return;
      }
      b.el.classList.add('is-ready');
      const baseX = rect.left + rect.width * b.anchor.x;
      const baseY = rect.top + rect.height * b.anchor.y;
      const drift = (rect.top - window.innerHeight / 2) * b.par;
      const kick = velocity * 0.4;
      const x = baseX + Math.sin(time / 1000 * b.speed * 1000 + b.phase) * b.ax + kick;
      const y = baseY + Math.sin(time / 1000 * b.speed * 900 + b.phase * 1.3) * b.ay + drift;
      const rotate = Math.sin(time / 1000 * b.speed * 1100 + b.phase) * b.rot + velocity * 0.12;
      b.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rotate.toFixed(1)}deg) scale(${b.scale})`;
    };

    if (reduced) {
      // Static fallback: decorative butterflies keep their position, no loop.
      flock.forEach(b => {
        const rect = b.anchor.el.getBoundingClientRect();
        const x = rect.left + rect.width * b.anchor.x;
        const y = rect.top + rect.height * b.anchor.y + window.scrollY;
        b.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${b.scale})`;
        b.el.classList.add('is-ready');
      });
      return;
    }

    let last = 0;
    let running = true;
    let prevScroll = window.scrollY;
    let velocity = 0;
    let scrolling = false;
    const loop = time => {
      if (!running) return;
      if (!document.hidden && time - last > 33) { // ~30fps is plenty and cheap
        last = time;
        velocity = velocity * 0.72 + (window.scrollY - prevScroll) * 0.28;
        prevScroll = window.scrollY;
        const fast = Math.abs(velocity) > 2;
        if (fast !== scrolling) {
          scrolling = fast;
          layer.classList.toggle('is-scrolling', scrolling);
        }
        flock.forEach(b => place(b, time, velocity));
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) requestAnimationFrame(loop);
    });
  }

  function initScrollStory() {
    const play = $('#play');
    if (!play) return;

    // Thin reading-progress line: turns every scroll into visible motion.
    if (!$('.scroll-progress')) {
      const bar = document.createElement('div');
      bar.className = 'scroll-progress';
      bar.setAttribute('aria-hidden', 'true');
      bar.innerHTML = '<i></i>';
      document.body.appendChild(bar);
      const fill = bar.firstElementChild;
      const update = () => {
        const span = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const p = Math.min(1, Math.max(0, window.scrollY / span));
        fill.style.transform = `scaleX(${p.toFixed(4)})`;
        bar.classList.toggle('is-active', p > 0.01);
      };
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      update();
    }

    // Reveal the hub cards and stage with the site's existing reveal pattern.
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    $$('.play-card').forEach(el => { el.classList.add('reveal'); obs.observe(el); });

    // Emphasise the interactive section once it enters the viewport.
    const seen = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        play.classList.add('in-view');
        seen.disconnect();
        B.track('butterfly_experience_viewed', { section: 'play' });
      });
    }, { threshold: 0.18 });
    seen.observe(play);
  }

  /* =======================================================================
     Feature 2 — Catch the Accessories
     A short arcade round: drag the gift box to catch real B products as they
     fall. The gameplay score is only points; it is never money, a discount
     or a shipping qualification. Caught products are listed on the results
     screen, where the player chooses what (if anything) goes to the bag.
     ======================================================================= */
  const CG_LIVES = 3;              // every missed piece costs one heart
  const CG_POINTS = 10;
  const CG_COMBO_EVERY = 5;        // streak needed per combo multiplier step
  const CG_MAX_COMBO = 5;
  const CG_LEVEL_SECONDS = 12;     // the game speeds up every 12 seconds
  const CG_MAX_SPEED = 1.05;       // cap, in arena heights per second

  const CG = {
    phase: 'idle',          // idle | running | paused | over
    forceMotion: false,
    static: false,     // player opted in despite reduced-motion
    raf: 0,
    last: 0,
    items: [],              // live falling objects
    caught: [],             // product ids, one entry per catch
    score: 0,
    streak: 0,
    lives: CG_LIVES,
    level: 1,
    elapsed: 0,
    spawnIn: 0.6,
    lastX: 0.5,
    bag: [],                // shuffled product ids (no repeats until used up)
    boxX: 0.5,              // box centre, 0..1 of arena width
    targetX: 0.5,
    dragId: null,
    W: 0, H: 0, boxW: 96, boxH: 72, size: 52,
    sel: {},                // results: productId -> { on, qty }
    fresh: {},              // results: freshly validated catalog rows
    best: (() => { try { return Number(localStorage.getItem('b2-play-best')) || 0; } catch { return 0; } })(),
    nodes: {}
  };

  const CG_BOX_SVG = `
    <svg viewBox="0 0 120 92" aria-hidden="true" focusable="false">
      <path d="M10 30h100l-7 52a8 8 0 0 1-8 7H25a8 8 0 0 1-8-7z" fill="#bd2b58"/>
      <path d="M6 22h108a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z" fill="#9c1f44"/>
      <path d="M54 22h12v67H54z" fill="#f7cbd7"/>
      <path d="M60 22c-8-16-26-16-26-6s16 8 26 6zM60 22c8-16 26-16 26-6s-16 8-26 6z" fill="none" stroke="#f7cbd7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  /* Only in-stock products with a picture can fall, so everything caught can
     really be bought. A small catalog simply repeats products. */
  function cgPool() {
    return B.products.filter(p => p.stock > 0 && p.images && p.images[0]);
  }

  function cgShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function cgNextProduct() {
    if (!CG.bag.length) CG.bag = cgShuffle(cgPool().map(p => p.id));
    let p = null;
    while (CG.bag.length && !p) p = byId(CG.bag.pop());
    return p && p.stock > 0 ? p : null;
  }

  function cgCaughtSummary() {
    const map = new Map();
    for (const id of CG.caught) map.set(id, (map.get(id) || 0) + 1);
    return Array.from(map, ([id, count]) => ({ id, count })).filter(r => byId(r.id));
  }

  function cgLive(id) {
    return CG.fresh[id] || byId(id);
  }

  /* ---- Markup ---------------------------------------------------------- */
  function cgHearts() {
    return Array.from({ length: CG_LIVES }, (_, i) => (i < CG.lives ? '♥' : '♡')).join(' ');
  }

  function cgCombo() {
    return Math.min(CG_MAX_COMBO, 1 + Math.floor(CG.streak / CG_COMBO_EVERY));
  }

  function cgHud() {
    return `
      <div class="cg-hud" aria-label="نتيجة الجولة">
        <div class="cg-stat"><span>النقاط</span><strong id="cgScore">0</strong></div>
        <div class="cg-stat"><span>القطع</span><strong id="cgCount">0</strong></div>
        <div class="cg-stat"><span>المستوى</span><strong id="cgLevel">1</strong></div>
        <div class="cg-stat hearts"><span>القلوب</span><strong id="cgLives" aria-label="${CG_LIVES} قلوب">${cgHearts()}</strong></div>
        <div class="cg-stat gold"><span>أفضل نتيجة</span><strong id="cgBest">${CG.best}</strong></div>
      </div>`;
  }

  function cgVeil(kind) {
    if (kind === 'paused') {
      return `<div class="cg-veil-card"><b>إيقاف مؤقت</b><p>الجولة واقفة. كمّلي لما تكوني جاهزة.</p>
        <button class="play-btn" id="cgResume">كمّلي ▶</button></div>`;
    }
    return `<div class="cg-veil-card"><b>اِلتقطي الإكسسوارات 🎁</b>
      <p>اسحبي الصندوق والتقطي القطع وهي بتنزل. معاكِ ${CG_LIVES} قلوب، وكل قطعة بتفوتك بتخسّرك قلب.<br>والسرعة بتزيد كل شوية.. شوفي هتوصلي لأي مستوى! 🔥</p>
      <button class="play-btn" id="cgStart">ابدئي الجولة ▶</button></div>`;
  }

  function cgShell() {
    return `
      <div class="cg-wrap">
        ${cgHud()}
        <div class="cg-arena" id="cgArena" role="application" tabindex="0"
             aria-label="لعبة التقاط الإكسسوارات: اسحبي الصندوق أو استخدمي الأسهم يمين ويسار">
          <div class="cg-fall" id="cgFall"></div>
          <div class="cg-box" id="cgBox" aria-hidden="true">${CG_BOX_SVG}</div>
          <div class="cg-level-banner" id="cgBanner" hidden></div>
          <div class="cg-veil" id="cgVeil">${cgVeil('intro')}</div>
        </div>
        <div class="cg-actions">
          <button class="play-btn ghost" id="cgPause" hidden>إيقاف مؤقت ❙❙</button>
          <button class="play-btn ghost" id="cgRestart" hidden>ابدئي من جديد ↺</button>
        </div>
        <p class="play-note">✦ كل قطعة بتنزل منتج حقيقي من كتالوج B. النقاط للعب بس، ومفيهاش أي خصم أو عرض.</p>
      </div>`;
  }

  function cgResultRow(r) {
    const p = cgLive(r.id);
    const s = CG.sel[r.id] || { on: false, qty: 1 };
    const out = !p || p.stock <= 0;
    const maxQ = out ? 0 : Math.max(1, B.maxQuantity(p) - B.quantityInBag(p.id));
    const full = !out && B.quantityInBag(p.id) >= B.maxQuantity(p);
    return `
      <div class="cg-row${s.on ? ' on' : ''}${out ? ' off' : ''}">
        <label class="cg-check">
          <input type="checkbox" data-cgsel="${esc(r.id)}" ${s.on ? 'checked' : ''} ${out || full ? 'disabled' : ''}>
          <span class="sr-only">اختاري ${esc(p ? p.name : '')}</span>
        </label>
        <img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy" decoding="async">
        <div class="cg-meta">
          <button class="cg-name" data-product="${esc(p.id)}">${esc(p.name)}</button>
          <span>${money(p.price)}${r.count > 1 ? ` • اتمسكت ×${r.count}` : ''}</span>
          ${out ? '<em>نفدت</em>' : full ? '<em>وصلتي لأقصى كمية في الشنطة</em>' : ''}
        </div>
        ${out || full || r.count < 2 ? '' : `
        <div class="cg-qty" role="group" aria-label="الكمية">
          <button data-cgq="${esc(r.id)}" data-d="-1" aria-label="أقل" ${s.qty <= 1 ? 'disabled' : ''}>−</button>
          <b>${Math.min(s.qty, Math.min(r.count, maxQ))}</b>
          <button data-cgq="${esc(r.id)}" data-d="1" aria-label="أكتر" ${s.qty >= Math.min(r.count, maxQ) ? 'disabled' : ''}>＋</button>
        </div>`}
      </div>`;
  }

  function cgSelectedTotals() {
    let n = 0, total = 0;
    for (const r of cgCaughtSummary()) {
      const s = CG.sel[r.id];
      const p = cgLive(r.id);
      if (!s || !s.on || !p || p.stock <= 0) continue;
      const q = cgQty(r, p);
      n += q;
      total += q * p.price;
    }
    return { n, total };
  }

  function cgQty(r, p) {
    const s = CG.sel[r.id] || { qty: 1 };
    const room = Math.max(0, B.maxQuantity(p) - B.quantityInBag(p.id));
    return Math.max(0, Math.min(s.qty || 1, r.count, room));
  }

  function cgResultsMarkup() {
    const rows = cgCaughtSummary();
    const caughtN = CG.caught.length;
    if (!rows.length) {
      return `
        <div class="play-empty cg-empty"><span>♡</span>
          <p>مفيش قطع اتمسكت المرة دي.. جرّبي تاني وهتبقي أحسن!</p>
          <div class="cg-end-actions">
            <button class="play-btn" id="cgAgain">العبي تاني ↺</button>
            <button class="play-btn ghost" id="cgBack">رجوع للتسوق</button>
          </div>
        </div>`;
    }
    const t = cgSelectedTotals();
    return `
      <div class="cg-results">
        <div class="cg-final"${CG.static ? ' hidden' : ''}>
          <div class="cg-stat"><span>النقاط</span><strong>${CG.score}</strong></div>
          <div class="cg-stat"><span>القطع</span><strong>${caughtN}</strong></div>
          <div class="cg-stat"><span>المستوى</span><strong>${CG.level}</strong></div>
          ${CG.score && CG.score >= CG.best ? '<div class="cg-stat gold"><span>أفضل نتيجة</span><strong>جديدة ★</strong></div>' : ''}
        </div>
        <p class="play-subhead">القطع اللي مسكتيها — اختاري اللي عايزاه</p>
        <div class="cg-grid-mini" aria-hidden="true">
          ${rows.map(r => `<img src="${esc(byId(r.id).images[0])}" alt="" loading="lazy">`).join('')}
        </div>
        <div class="cg-list">${rows.map(cgResultRow).join('')}</div>
        <div class="cg-total">
          <div>
            <span class="label">المختار (${t.n} قطعة)</span>
            <strong id="cgTotal">${money(t.total)}</strong>
          </div>
          <div class="cg-end-actions">
            <button class="play-btn" id="cgAdd" ${t.n ? '' : 'disabled'}>أضيفي المختار للشنطة ＋</button>
            <button class="play-btn ghost" id="cgSelectAll">اختاري الكل</button>
          </div>
        </div>
        ${CG.static ? '' : cgShareMarkup()}
        <div class="cg-end-actions">
          <button class="play-btn ghost" id="cgAgain">العبي تاني ↺</button>
          <button class="play-btn ghost" id="cgBack">رجوع للتسوق</button>
        </div>
      </div>`;
  }

  /* Reduced motion: no falling objects. The same products are offered as a
     plain, selectable list so nothing is lost. */
  function cgStaticHeader() {
    return `
      ${alertBox('', 'جهازك مضبوط على تقليل الحركة، فبنعرض القطع كقايمة تختاري منها مباشرةً.')}
      <p class="play-note"><button class="play-btn ghost" id="cgForce">العبي اللعبة بالحركة برضه</button></p>`;
  }

  /* ---- Rendering entry point -------------------------------------------- */
  function renderCatchPanel() {
    cgHalt();
    CG.phase = 'idle';
    CG.sel = {};
    CG.fresh = {};
    CG.static = false;
    cgShareReset();
    const pool = cgPool();
    if (!pool.length) {
      $('#playPanel').innerHTML = `<div class="play-empty"><span>♡</span><p>مفيش قطع متوفرة للعبة حالياً. جرّبيها تاني قريب.</p></div>`;
      return;
    }
    if (reduceMotion() && !CG.forceMotion) {
      CG.static = true;
      CG.caught = cgShuffle(pool.slice()).slice(0, 12).map(p => p.id);
      CG.score = 0;
      $('#playPanel').innerHTML = cgStaticHeader() + cgResultsMarkup();
    } else {
      $('#playPanel').innerHTML = cgShell();
      cgBindArena();
      cgMeasure();
      cgPlaceBox();
    }
    B.track('catch_game_opened', {});
  }

  /* ---- Round lifecycle -------------------------------------------------- */
  function cgHalt() {
    if (CG.raf) cancelAnimationFrame(CG.raf);
    CG.raf = 0;
    CG.items.forEach(it => it.el.remove());
    CG.items = [];
    CG.dragId = null;
    document.body.classList.remove('cg-playing');
    if (CG.phase === 'running' || CG.phase === 'paused') CG.phase = 'idle';
  }

  function cgMeasure() {
    const arena = $('#cgArena');
    if (!arena) return;
    const r = arena.getBoundingClientRect();
    CG.W = r.width;
    CG.H = r.height;
    CG.boxW = Math.max(84, Math.min(116, CG.W * 0.24));
    CG.boxH = CG.boxW * 0.77;
    CG.size = Math.max(44, Math.min(62, CG.W * 0.13));
    const box = $('#cgBox');
    if (box) { box.style.width = CG.boxW + 'px'; box.style.height = CG.boxH + 'px'; }
  }

  function cgBoxLeft() {
    const half = CG.boxW / 2;
    const cx = Math.max(half, Math.min(CG.W - half, CG.boxX * CG.W));
    return cx - half;
  }

  function cgPlaceBox() {
    const box = $('#cgBox');
    if (!box) return;
    box.style.transform = `translate3d(${cgBoxLeft()}px, ${CG.H - CG.boxH - 8}px, 0)`;
  }

  function cgSetVeil(kind) {
    const veil = $('#cgVeil');
    if (!veil) return;
    veil.hidden = !kind;
    veil.innerHTML = kind ? cgVeil(kind) : '';
    if (kind) veil.querySelector('button')?.focus({ preventScroll: true });
  }

  function cgSetButtons() {
    const pause = $('#cgPause'), restart = $('#cgRestart');
    if (pause) pause.hidden = CG.phase !== 'running';
    if (restart) restart.hidden = !(CG.phase === 'running' || CG.phase === 'paused');
  }

  function cgSyncHud() {
    const set = (id, v) => { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; };
    set('#cgScore', CG.score);
    set('#cgCount', CG.caught.length);
    set('#cgLevel', CG.level);
    set('#cgLives', cgHearts());
    const live = $('#cgLives');
    if (live) live.setAttribute('aria-label', `${CG.lives} قلوب`);
  }

  function cgStart() {
    cgHalt();
    cgMeasure();
    CG.caught = [];
    CG.score = 0;
    CG.streak = 0;
    CG.lives = CG_LIVES;
    CG.level = 1;
    CG.elapsed = 0;
    CG.spawnIn = 0.5;
    CG.lastX = 0.5;
    CG.bag = [];
    CG.boxX = CG.targetX = 0.5;
    CG.sel = {};
    CG.fresh = {};
    CG.phase = 'running';
    CG.last = 0;
    cgSetVeil('');
    cgSetButtons();
    cgSyncHud();
    cgPlaceBox();
    document.body.classList.add('cg-playing');
    const arena = $('#cgArena');
    if (arena) {
      arena.scrollIntoView({ behavior: 'auto', block: 'center' });
      arena.focus({ preventScroll: true });
    }
    B.track('catch_game_started', {});
    CG.raf = requestAnimationFrame(cgLoop);
  }

  function cgPause() {
    if (CG.phase !== 'running') return;
    CG.phase = 'paused';
    if (CG.raf) cancelAnimationFrame(CG.raf);
    CG.raf = 0;
    CG.dragId = null;
    cgSetVeil('paused');
    cgSetButtons();
  }

  function cgResume() {
    if (CG.phase !== 'paused') return;
    CG.phase = 'running';
    CG.last = 0;
    cgSetVeil('');
    cgSetButtons();
    CG.raf = requestAnimationFrame(cgLoop);
  }

  function cgLoop(time) {
    if (CG.phase !== 'running') return;
    const dt = CG.last ? Math.min(0.05, (time - CG.last) / 1000) : 0;
    CG.last = time;

    CG.elapsed += dt;
    const level = 1 + Math.floor(CG.elapsed / CG_LEVEL_SECONDS);
    if (level !== CG.level) { CG.level = level; cgSyncHud(); cgBanner(`المستوى ${level} 🔥 أسرع!`); }

    // Smooth follow toward the pointer target.
    CG.boxX += (CG.targetX - CG.boxX) * Math.min(1, dt * 18);
    cgPlaceBox();

    // Each level adds speed and more pieces at once, up to a cap.
    CG.spawnIn -= dt;
    if (CG.spawnIn <= 0 && CG.items.length < Math.min(8, 3 + level)) {
      cgSpawn();
      CG.spawnIn = Math.max(0.4, 1.1 - 0.07 * (level - 1)) + Math.random() * 0.2;
    }

    const speed = CG.H * Math.min(CG_MAX_SPEED, 0.28 + 0.07 * (level - 1));
    const boxTop = CG.H - CG.boxH - 8;
    const boxLeft = cgBoxLeft();
    const boxCx = boxLeft + CG.boxW / 2;

    for (let i = CG.items.length - 1; i >= 0; i--) {
      const it = CG.items[i];
      it.y += speed * it.factor * dt;
      it.rot += it.spin * dt;
      const bottom = it.y + CG.size;
      const cx = it.x * CG.W;
      if (!it.done && bottom >= boxTop + 10 && it.y < boxTop + CG.boxH * 0.45 &&
          Math.abs(cx - boxCx) <= CG.boxW / 2 + CG.size * 0.1) {
        it.done = true;
        cgCollect(it, i);
        continue;
      }
      if (it.y > CG.H) {
        it.el.remove();
        CG.items.splice(i, 1);
        if (cgMiss()) return;
        continue;
      }
      it.el.style.transform = `translate3d(${cx - CG.size / 2}px, ${it.y}px, 0) rotate(${it.rot}deg)`;
    }
    CG.raf = requestAnimationFrame(cgLoop);
  }

  function cgBanner(text) {
    const el = $('#cgBanner');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(cgBanner.timer);
    cgBanner.timer = setTimeout(() => { el.hidden = true; }, 1400);
  }

  /* A missed piece costs a heart and breaks the combo. Returns true when
     that was the last heart and the round is over. */
  function cgMiss() {
    CG.streak = 0;
    CG.lives = Math.max(0, CG.lives - 1);
    cgSyncHud();
    const arena = $('#cgArena');
    if (arena) {
      arena.classList.remove('hit');
      void arena.offsetWidth;
      arena.classList.add('hit');
    }
    if (CG.lives <= 0) { cgFinish(); return true; }
    return false;
  }

  function cgSpawn() {
    const p = cgNextProduct();
    if (!p) return;
    // Keep consecutive drops apart so no pattern is impossible to reach.
    let x = 0.1 + Math.random() * 0.8;
    for (let tries = 0; tries < 4 && Math.abs(x - CG.lastX) < 0.2; tries++) x = 0.1 + Math.random() * 0.8;
    CG.lastX = x;

    const el = document.createElement('div');
    el.className = 'cg-item';
    el.style.width = el.style.height = CG.size + 'px';
    const img = document.createElement('img');
    img.src = p.images[0];
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.onerror = () => { el.classList.add('noimg'); img.remove(); el.textContent = '♡'; };
    el.append(img);
    $('#cgFall').append(el);
    CG.items.push({ id: p.id, el, x, y: -CG.size, rot: (Math.random() - 0.5) * 30,
      spin: (Math.random() - 0.5) * 50, factor: 0.85 + Math.random() * 0.3, done: false });
  }

  function cgCollect(it, index) {
    CG.items.splice(index, 1);
    CG.caught.push(it.id);
    CG.streak++;
    const gain = CG_POINTS * cgCombo();
    CG.score += gain;
    cgSyncHud();

    it.el.style.transform += ' scale(0.2)';
    it.el.classList.add('cg-in');
    setTimeout(() => it.el.remove(), 180);

    const box = $('#cgBox'), fall = $('#cgFall');
    if (box) {
      box.classList.remove('pop');
      void box.offsetWidth;
      box.classList.add('pop');
    }
    if (fall) {
      const pop = document.createElement('span');
      pop.className = 'cg-pop';
      pop.textContent = '+' + gain + (cgCombo() > 1 ? ' ×' + cgCombo() : '');
      pop.style.left = (it.x * CG.W) + 'px';
      pop.style.top = (CG.H - CG.boxH - 30) + 'px';
      fall.append(pop);
      setTimeout(() => pop.remove(), 650);
    }
  }

  function cgFinish() {
    if (CG.raf) cancelAnimationFrame(CG.raf);
    CG.raf = 0;
    CG.items.forEach(it => it.el.remove());
    CG.items = [];
    CG.phase = 'over';
    cgShareReset();
    document.body.classList.remove('cg-playing');
    if (CG.score > CG.best) {
      CG.best = CG.score;
      try { localStorage.setItem('b2-play-best', String(CG.best)); } catch { /* storage unavailable */ }
    }
    B.track('catch_game_completed', { score: CG.score, caught: CG.caught.length, level: CG.level, seconds: Math.round(CG.elapsed) });
    $('#playPanel').innerHTML = cgResultsMarkup();
    $('#playStage')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---- Input: pointer events share mouse, touch and pen ----------------- */
  function cgPointerX(e) {
    const arena = $('#cgArena');
    if (!arena) return CG.targetX;
    const r = arena.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }

  function cgBindArena() {
    const arena = $('#cgArena');
    if (!arena) return;

    arena.addEventListener('pointerdown', e => {
      if (CG.phase !== 'running' || e.target.closest('button')) return;
      CG.dragId = e.pointerId;
      try { arena.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      CG.targetX = cgPointerX(e);
      e.preventDefault();
    });
    arena.addEventListener('pointermove', e => {
      if (CG.phase !== 'running' || CG.dragId !== e.pointerId) return;
      CG.targetX = cgPointerX(e);
    });
    const end = e => {
      if (CG.dragId === e.pointerId) CG.dragId = null;
    };
    arena.addEventListener('pointerup', end);
    arena.addEventListener('pointercancel', end);
    arena.addEventListener('lostpointercapture', end);
    arena.addEventListener('dragstart', e => e.preventDefault());
    arena.addEventListener('selectstart', e => e.preventDefault());

    arena.addEventListener('keydown', e => {
      if (CG.phase !== 'running') return;
      if (e.key === 'ArrowLeft') { CG.targetX = Math.max(0, CG.targetX - 0.07); e.preventDefault(); }
      if (e.key === 'ArrowRight') { CG.targetX = Math.min(1, CG.targetX + 0.07); e.preventDefault(); }
    });
  }

  window.addEventListener('resize', () => {
    if (!$('#cgArena')) return;
    cgMeasure();
    cgPlaceBox();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && CG.phase === 'running') cgPause();
  });

  /* ---- Results: selection and add-to-bag ---------------------------------- */
  function cgRefreshResults() {
    const panel = $('#playPanel');
    if (panel) panel.innerHTML = (CG.static ? cgStaticHeader() : '') + cgResultsMarkup();
  }

  function cgToggle(id, on) {
    const row = cgCaughtSummary().find(r => r.id === id);
    if (!row) return;
    const s = CG.sel[id] || { on: false, qty: row.count };
    s.on = on;
    if (!s.qty) s.qty = row.count;
    CG.sel[id] = s;
    cgRefreshResults();
  }

  function cgStep(id, d) {
    const row = cgCaughtSummary().find(r => r.id === id);
    const p = cgLive(id);
    if (!row || !p) return;
    const s = CG.sel[id] || { on: true, qty: row.count };
    const room = Math.max(1, B.maxQuantity(p) - B.quantityInBag(p.id));
    s.qty = Math.max(1, Math.min(Math.min(row.count, room), (s.qty || row.count) + d));
    CG.sel[id] = s;
    cgRefreshResults();
  }

  function cgSelectAll() {
    for (const r of cgCaughtSummary()) {
      const p = cgLive(r.id);
      if (!p || p.stock <= 0 || B.quantityInBag(p.id) >= B.maxQuantity(p)) continue;
      CG.sel[r.id] = { on: true, qty: (CG.sel[r.id] && CG.sel[r.id].qty) || r.count };
    }
    cgRefreshResults();
  }

  /* Re-check price and stock against the live catalog right before adding.
     If anything changed the list is refreshed and nothing is added until the
     player confirms again. */
  async function cgAddSelected() {
    const rows = cgCaughtSummary().filter(r => CG.sel[r.id] && CG.sel[r.id].on);
    if (!rows.length) return;
    const btn = $('#cgAdd');
    if (btn) { btn.disabled = true; btn.textContent = 'بنراجع الأسعار والمخزون…'; }

    let changed = false;
    try {
      const d = await B.api('catalog');
      const fresh = {};
      for (const p of d.products) fresh[p.id] = p;
      for (const r of rows) {
        const old = cgLive(r.id);
        const now = fresh[r.id];
        if (!now || now.stock <= 0) { changed = true; if (now) CG.fresh[r.id] = now; else delete CG.sel[r.id]; continue; }
        if (!old || old.price !== now.price) changed = true;
        CG.fresh[r.id] = now;
      }
    } catch { /* offline: fall back to the data already loaded; the cart re-validates at checkout */ }

    if (changed) {
      B.toast('في تغيير في سعر أو توفر بعض القطع.. راجعي الاختيار وأكدي تاني');
      cgRefreshResults();
      return;
    }

    const added = [];
    for (const r of rows) {
      const p = cgLive(r.id);
      if (!p || p.stock <= 0) continue;
      const q = cgQty(r, p);
      let done = 0;
      for (let i = 0; i < q; i++) {
        if (B.quantityInBag(p.id) >= B.maxQuantity(p)) break;
        B.addItem(p.id, true);
        done++;
      }
      if (done) added.push({ ...p, quantity: done });
    }
    B.save();
    if (!added.length) {
      B.toast('القطع دي موجودة بالكمية المتاحة بالفعل في شنطتك');
      cgRefreshResults();
      return;
    }
    const units = added.reduce((n, p) => n + p.quantity, 0);
    B.toast(`اتضافت ${units} قطعة لشنطتك ♡`);
    B.track('catch_game_add_to_cart', {
      currency: 'EGP',
      value: added.reduce((n, p) => n + p.price * p.quantity, 0) / 100,
      items: B.trackItems(added)
    }, 'AddToCart');
    CG.sel = {};
    cgRefreshResults();
    B.openCart();
  }

  /* ---- Share card (1080x1920, sized for an Instagram story) -------------- */
  const CG_LOGO = '/assets/1759340769821229036.png';
  const CG_SHARE = { url: '', blob: null, busy: false };

  function cgShareReset() {
    CG_SHARE.url = '';
    CG_SHARE.blob = null;
    CG_SHARE.busy = false;
  }

  function cgLoadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function cgRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Draws the picture like object-fit: cover so product photos are cropped,
     never stretched. */
  function cgDrawCover(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  async function cgBuildShareImage() {
    try { await document.fonts.ready; } catch { /* fonts API unavailable */ }
    const W = 1080, H = 1920;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const ink = '#1c1519', hot = '#bd2b58', pink = '#f7cbd7', gold = '#c69a5a';
    const sans = '"Noto Sans Arabic", "DM Sans", system-ui, sans-serif';
    const serif = '"Playfair Display", Georgia, serif';

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fef5f8');
    bg.addColorStop(1, '#fffdf9');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = pink; ctx.lineWidth = 6;
    cgRoundRect(ctx, 40, 40, W - 80, H - 80, 48); ctx.stroke();

    // Brand
    const logo = await cgLoadImage(CG_LOGO);
    let y = 120;
    if (logo) {
      const lh = 150, lw = (logo.width / logo.height) * lh;
      ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
      y += lh + 20;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = ink;
    ctx.font = `600 54px ${serif}`;
    ctx.fillText('B ACCESSORIES', W / 2, y + 40);

    // Title and score
    ctx.direction = 'rtl';
    ctx.fillStyle = hot;
    ctx.font = `700 64px ${sans}`;
    ctx.fillText('اِلتقطي الإكسسوارات', W / 2, 520);

    ctx.direction = 'ltr';
    ctx.fillStyle = ink;
    ctx.font = `700 260px ${serif}`;
    ctx.fillText(String(CG.score), W / 2, 790);
    ctx.direction = 'rtl';
    ctx.fillStyle = '#7e7178';
    ctx.font = `500 46px ${sans}`;
    ctx.fillText('نقطة', W / 2, 860);

    // Level and catches
    const chips = [`المستوى ${CG.level}`, `${CG.caught.length} قطعة`];
    ctx.font = `700 48px ${sans}`;
    const widths = chips.map(label => Math.max(250, ctx.measureText(label).width + 80));
    let right = W / 2 + (widths.reduce((n, w) => n + w, 0) + 30 * (chips.length - 1)) / 2;
    chips.forEach((label, i) => {
      const w = widths[i];
      const cx = right - w / 2;
      ctx.fillStyle = '#ffffff';
      cgRoundRect(ctx, cx - w / 2, 920, w, 100, 50); ctx.fill();
      ctx.strokeStyle = pink; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = ink;
      ctx.fillText(label, cx, 988);
      right -= w + 30;
    });

    // Collected products: up to 6 different pieces, most caught first
    const rows = cgCaughtSummary()
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const imgs = await Promise.all(rows.map(r => cgLoadImage(byId(r.id).images[0])));
    const cols = 3, size = 290, gap = 30;
    const gridW = cols * size + (cols - 1) * gap;
    const gx = (W - gridW) / 2;
    imgs.forEach((img, i) => {
      const x = gx + (i % cols) * (size + gap);
      const yy = 1100 + Math.floor(i / cols) * (size + gap);
      ctx.save();
      cgRoundRect(ctx, x, yy, size, size, 32);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, yy, size, size);
      if (img) cgDrawCover(ctx, img, x, yy, size, size);
      ctx.restore();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6;
      cgRoundRect(ctx, x, yy, size, size, 32); ctx.stroke();
    });

    // Footer
    ctx.direction = 'rtl';
    ctx.fillStyle = ink;
    ctx.font = `700 56px ${sans}`;
    ctx.fillText('تقدري تتخطي نتيجتي؟ 🎁', W / 2, 1790);
    ctx.direction = 'ltr';
    ctx.fillStyle = gold;
    ctx.font = `600 44px ${serif}`;
    ctx.fillText(location.host, W / 2, 1860);

    return new Promise((resolve, reject) => {
      try {
        cv.toBlob(b => (b ? resolve(b) : reject(new Error('empty'))), 'image/png');
      } catch (err) { reject(err); }
    });
  }

  async function cgMakeShare() {
    if (CG_SHARE.busy) return;
    CG_SHARE.busy = true;
    const btn = $('#cgShare');
    if (btn) { btn.disabled = true; btn.textContent = 'بنجهّز الصورة…'; }
    try {
      const blob = await cgBuildShareImage();
      // A data: URL, because the page's security policy allows data: images but not blob:.
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      cgShareReset();
      CG_SHARE.blob = blob;
      CG_SHARE.url = String(dataUrl);
      B.track('catch_game_share_image', { score: CG.score, level: CG.level });
    } catch {
      CG_SHARE.busy = false;
      B.toast('معرفناش نجهّز الصورة دلوقتي، جرّبي تاني');
    }
    CG_SHARE.busy = false;
    cgRefreshResults();
    $('#cgSharePreview')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
  }

  async function cgShareNative() {
    if (!CG_SHARE.blob) return;
    const file = new File([CG_SHARE.blob], 'b-accessories-score.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'B Accessories', text: `جبت ${CG.score} نقطة في لعبة B Accessories! 🎁` });
        B.track('catch_game_share', { method: 'native' });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // she closed the share sheet
    }
    cgShareDownload();
  }

  function cgShareDownload() {
    if (!CG_SHARE.url) return;
    const a = document.createElement('a');
    a.href = CG_SHARE.url;
    a.download = 'b-accessories-score.png';
    document.body.append(a);
    a.click();
    a.remove();
    B.toast('اتحفظت الصورة ♡ ارفعيها على ستوري إنستجرام');
    B.track('catch_game_share', { method: 'download' });
  }

  function cgShareMarkup() {
    if (!CG_SHARE.url) {
      return `<div class="cg-share"><button class="play-btn ghost" id="cgShare">اعملي صورة نتيجتك للمشاركة 📸</button></div>`;
    }
    return `
      <div class="cg-share" id="cgSharePreview">
        <img class="cg-share-img" src="${esc(CG_SHARE.url)}" alt="صورة نتيجتك للمشاركة على الستوري">
        <div class="cg-end-actions">
          <button class="play-btn" id="cgShareNow">شاركي الصورة ↗</button>
          <button class="play-btn ghost" id="cgShareSave">نزّلي الصورة</button>
        </div>
      </div>`;
  }

  function cgBackToShop() {
    closeExperience();
    const shop = document.getElementById('shop');
    if (shop) shop.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /* =======================================================================
     Feature 4 — Mystery Box builder
     ======================================================================= */
  const mb = {
    step: 1,
    budget: 0,
    style: '',
    tone: 'any',
    cats: [],
    avoid: [],
    items: [],
    target: 0,
    swapFor: null,
    view: 'wizard'
  };

  function budgetTiers() {
    const prices = B.available().map(p => p.price).sort((a, b) => a - b);
    if (!prices.length) return [];
    const unit = 5000; // round to 50 EGP for readable tiers
    const round = v => Math.max(unit, Math.ceil(v / unit) * unit);
    const mid = prices[Math.floor(prices.length / 2)];
    const top3 = prices.slice(-3).reduce((a, b) => a + b, 0);
    const top5 = prices.slice(-5).reduce((a, b) => a + b, 0);
    const raw = [round(mid * 1.8), round(top3), round(top5 * 0.85)];
    const tiers = [];
    for (const v of raw) if (!tiers.length || v > tiers[tiers.length - 1]) tiers.push(v);
    while (tiers.length < 3) tiers.push(tiers[tiers.length - 1] + unit * 2);
    return tiers.slice(0, 3).map((v, i) => ({
      value: v,
      label: i === 0 ? 'بوكس صغير' : i === 1 ? 'بوكس متوسط' : 'بوكس كبير',
      hint: i === 0 ? '٢ إلى ٣ قطع' : i === 1 ? '٣ إلى ٤ قطع' : '٤ إلى ٥ قطع'
    }));
  }

  function selectBox(o) {
    const rnd = mulberry32(seedFrom(o.seed));
    let pool = B.available();
    if (o.tone && o.tone !== 'any') pool = pool.filter(p => tonesOf(p).has(o.tone));
    if (o.cats && o.cats.length) pool = pool.filter(p => o.cats.includes(p.category_id));
    if (o.avoid && o.avoid.length) pool = pool.filter(p => !o.avoid.includes(p.category_id));
    if (!pool.length) return { items: [], total: 0, reference: 0, reason: 'no_candidates' };

    const scored = pool.map(p => {
      let s = o.style ? (styleScore(p)[o.style] || 0) : 0;
      if (p.featured) s += 0.6;
      if (p.compare_price > p.price) s += 0.3;
      return { p, s: s + rnd() * 1.2 };
    }).sort((a, b) => b.s - a.s);

    const prices = pool.map(p => p.price).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    const items = [];
    const used = new Set();
    const catCount = {};
    const spent = () => items.reduce((n, x) => n + x.price, 0);
    const fits = p => spent() + p.price <= o.budget;
    const goal = Math.max(2, Math.min(5, Math.round(o.budget / Math.max(median, 1))));

    for (const cap of [1, 2, 3, 99]) {
      for (const { p } of scored) {
        if (items.length >= goal) break;
        if (used.has(p.id)) continue;
        if ((catCount[p.category_id] || 0) >= cap) continue;
        if (!fits(p)) continue;
        items.push(p);
        used.add(p.id);
        catCount[p.category_id] = (catCount[p.category_id] || 0) + 1;
      }
      if (items.length >= goal) break;
    }
    for (const { p } of scored) {
      if (items.length >= 6) break;
      if (used.has(p.id) || !fits(p)) continue;
      items.push(p);
      used.add(p.id);
    }

    if (!items.length) {
      return { items: [], total: 0, reference: 0, reason: 'over_budget', cheapest: prices[0] };
    }
    const total = items.reduce((n, p) => n + p.price, 0);
    const reference = items.reduce((n, p) => n + (p.compare_price > p.price ? p.compare_price : p.price), 0);
    return { items, total, reference, reason: '' };
  }

  function boxSeed(extra = '') {
    return JSON.stringify({
      b: mb.budget, s: mb.style, t: mb.tone,
      c: [...mb.cats].sort(), a: [...mb.avoid].sort(), x: extra
    });
  }

  function boxGenerate(extra = '') {
    if (!mb.budget) return;
    const result = selectBox({
      budget: mb.budget,
      style: mb.style,
      tone: mb.tone,
      cats: mb.cats,
      avoid: mb.avoid,
      seed: boxSeed(extra)
    });
    mb.items = result.items;
    mb.reason = result;
    mb.view = 'result';
    B.track('mystery_box_generated', {
      currency: 'EGP',
      value: result.total / 100,
      items: B.trackItems(result.items),
      budget: mb.budget / 100,
      style: mb.style || 'any'
    });
    renderBoxPanel();
  }

  function boxAlternatives(slotIndex) {
    const current = mb.items[slotIndex];
    if (!current) return [];
    const chosen = new Set(mb.items.map(p => p.id));
    const spentOthers = mb.items.reduce((n, p, i) => i === slotIndex ? n : n + p.price, 0);
    const remaining = mb.budget - spentOthers;
    let pool = B.available().filter(p => !chosen.has(p.id) && p.price <= remaining && p.price !== current.price);
    if (mb.tone !== 'any') {
      const toned = pool.filter(p => tonesOf(p).has(mb.tone));
      if (toned.length) pool = toned;
    }
    if (mb.avoid.length) pool = pool.filter(p => !mb.avoid.includes(p.category_id));
    return pool
      .map(p => ({ p, s: (mb.style ? (styleScore(p)[mb.style] || 0) : 0) + (p.featured ? 0.5 : 0) }))
      .sort((a, b) => b.s - a.s || b.p.price - a.p.price)
      .slice(0, 6)
      .map(x => x.p);
  }

  function renderBoxPanel() {
    const panel = $('#playPanel');
    const tiers = budgetTiers();
    if (!tiers.length) {
      panel.innerHTML = `<div class="play-empty"><span>♡</span><p>مفيش قطع متوفرة حالياً لتجهيز بوكس. جربي تاني بعد تحديث المخزون.</p></div>`;
      return;
    }
    if (!mb.budget) mb.budget = tiers[1].value;

    const cats = B.categories.filter(c => B.products.some(p => p.category_id === c.id && p.stock > 0));

    panel.innerHTML = `
      <div class="play-steps">
        ${['اختاري الميزانية', 'اختاري الستايل', 'تفضيلات اختيارية', 'راجعي البوكس']
          .map((label, i) => `<span class="play-step-chip ${mb.view === 'result' ? 'done' : mb.step === i + 1 ? 'active' : mb.step > i + 1 ? 'done' : ''}">${i + 1}. ${label}</span>`).join('')}
      </div>

      ${mb.view === 'wizard' ? `
      <div class="mb-layout">
        <div>
          <p class="play-subhead">١. ميزانية البوكس (مبنية على أسعار الكتالوج الحالية)</p>
          <div class="mb-budget-grid">
            ${tiers.map(t => `
              <button class="mb-budget ${mb.budget === t.value ? 'active' : ''}" data-mbbudget="${t.value}">
                <b>حتى ${money(t.value)}</b>
                <span>${esc(t.label)} • ${esc(t.hint)}</span>
              </button>
            `).join('')}
          </div>

          <p class="play-subhead" style="margin-top:22px;">٢. الستايل المفضل</p>
          <div class="play-chip-row">
            ${STYLES.map(s => `<button class="play-chip ${mb.style === s.id ? 'active' : ''}" data-mbstyle="${s.id}">${esc(s.name)}<small>${esc(s.en)}</small></button>`).join('')}
            <button class="play-chip ${!mb.style ? 'active' : ''}" data-mbstyle="">مفاجأة كاملة ✦</button>
          </div>

          <p class="play-subhead" style="margin-top:22px;">٣. تفضيلات اختيارية</p>
          <p class="play-subhead" style="margin:0 0 8px;font-weight:600;font-size:12px;color:var(--muted);">اللون المفضل</p>
          <div class="play-chip-row">
            ${TONES.map(t => `<button class="play-chip ${mb.tone === t.id ? 'active' : ''}" data-mbtone="${t.id}">${esc(t.name)}</button>`).join('')}
            <button class="play-chip ${mb.tone === 'any' ? 'active' : ''}" data-mbtone="any">بدون تفضيل</button>
          </div>

          <p class="play-subhead" style="margin:18px 0 8px;font-weight:600;font-size:12px;color:var(--muted);">أقسام تفضليها (اختياري)</p>
          <div class="play-chip-row">
            ${cats.map(c => `<button class="play-chip ${mb.cats.includes(c.id) ? 'active' : ''}" data-mbcat="${esc(c.id)}">${esc(c.name)}</button>`).join('')}
          </div>

          <p class="play-subhead" style="margin:18px 0 8px;font-weight:600;font-size:12px;color:var(--muted);">أقسام مش بتحبيها (اختياري)</p>
          <div class="play-chip-row">
            ${cats.map(c => `<button class="play-chip ${mb.avoid.includes(c.id) ? 'active' : ''}" data-mbavoid="${esc(c.id)}">${esc(c.name)}</button>`).join('')}
          </div>
        </div>

        <aside class="mb-aside">
          <p class="play-subhead">ملخص اختيارك</p>
          <div class="mb-total"><span>الميزانية</span><b>${money(mb.budget)}</b></div>
          <div class="mb-total"><span>الستايل</span><b>${esc(mb.style ? (STYLES.find(s => s.id === mb.style) || {}).name : 'مفاجأة')}</b></div>
          <div class="mb-total"><span>اللون</span><b>${esc(mb.tone === 'any' ? 'بدون تفضيل' : (TONES.find(t => t.id === mb.tone) || {}).name)}</b></div>
          <button class="play-btn" style="width:100%;margin-top:16px;" id="mbGenerate">جهّزي البوكس ✦</button>
          <p class="play-note" style="margin-top:12px;">✦ بنختار من القطع المتوفرة فعلاً في الكتالوج، وسعر البوكس = مجموع أسعار القطع بدون أي رسوم إضافية.</p>
        </aside>
      </div>` : `
      <div class="mb-layout">
        <div>
          <p class="play-subhead">بوكسك (${mb.items.length} قطعة)</p>
          ${mb.items.length ? mb.items.map((p, i) => `
            <div class="mb-slot">
              <img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">
              <div class="meta">
                <b>${esc(p.name)}</b>
                <span>${money(p.price)} • ${esc(categoryName(p.category_id))}</span>
                ${p.compare_price > p.price ? `<span class="ref">${money(p.compare_price)}</span>` : ''}
              </div>
              <div class="mb-slot-actions">
                <button class="play-chip" data-mbswap="${i}">بدّليها</button>
                <button class="play-chip" data-mbremove="${i}" aria-label="شيل ${esc(p.name)}">✕</button>
              </div>
            </div>
            ${mb.swapFor === i ? `
              <div class="mb-swap-list">
                ${boxAlternatives(i).map(alt => `
                  <button class="play-product" data-mbpick="${i}:${esc(alt.id)}">
                    <img src="${esc(alt.images[0])}" alt="${esc(alt.name)}" loading="lazy">
                    <b>${esc(alt.name)}</b>
                    <span>${money(alt.price)}</span>
                  </button>
                `).join('') || '<p class="play-note">مفيش بديل في حدود الميزانية المتبقية.</p>'}
              </div>` : ''}
          `).join('') : `<div class="play-empty"><span>♡</span><p>مقدرناش نجهّز بوكس بالميزانية دي من القطع المتوفرة حالياً.</p></div>`}

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
            <button class="play-btn ghost" id="mbBack">↺ ارجعي للاختيارات</button>
            <button class="play-btn ghost" id="mbAgain" ${mb.items.length ? '' : 'disabled'}>اقتراح بوكس تاني ↻</button>
            <button class="play-btn ghost" id="mbAddMore" ${mb.items.length < 6 ? '' : 'disabled'}>أضيفي قطعة ＋</button>
          </div>

          <p class="play-note" style="margin-top:14px;">
            ✦ كل محتوى البوكس ظاهر لك بالاسم والصورة والسعر قبل الشراء — مفيش أي تفاصيل مخفية أو رسوم غير موضحة.
          </p>
        </div>

        <aside class="mb-aside">
          <p class="play-subhead">ملخص البوكس</p>
          <div class="mb-total"><span>عدد القطع</span><b>${mb.items.length}</b></div>
          <div class="mb-total"><span>إجمالي القطع</span><b>${money(mb.items.reduce((n, p) => n + p.price, 0))}</b></div>
          <div class="mb-total"><span>القيمة المرجعية</span><b>${money(mb.items.reduce((n, p) => n + (p.compare_price > p.price ? p.compare_price : p.price), 0))}</b></div>
          <div class="mb-meter"><i style="width:${mb.budget ? Math.min(100, Math.round(mb.items.reduce((n, p) => n + p.price, 0) / mb.budget * 100)) : 0}%"></i></div>
          <div class="mb-total"><span>المتاح من ميزانيتك</span><b>${money(Math.max(0, mb.budget - mb.items.reduce((n, p) => n + p.price, 0)))}</b></div>
          <div class="mb-total grand"><span>سعر البوكس</span><b>${money(mb.items.reduce((n, p) => n + p.price, 0))}</b></div>
          ${(() => {
            const total = mb.items.reduce((n, p) => n + p.price, 0);
            const ref = mb.items.reduce((n, p) => n + (p.compare_price > p.price ? p.compare_price : p.price), 0);
            return ref > total ? `<p class="play-note">توفيرك مقابل الأسعار المرجعية للقطع: <strong>${money(ref - total)}</strong>.</p>` : '';
          })()}
          <p class="play-note">الشحن يُحسب في خطوة إتمام الطلب حسب إعدادات المتجر. ${esc(B.config.policy || '')}</p>
          <button class="play-btn" style="width:100%;margin-top:14px;" id="mbAdd" ${mb.items.some(p => p.stock > 0) ? '' : 'disabled'}>
            أضيفي البوكس للشنطة ＋
          </button>
        </aside>
      </div>`}
    `;
  }

  /* =======================================================================
     Feature 5 — Accessory personality quiz
     ======================================================================= */
  const PROFILES = [
    {
      id: 'minimalist', name: 'الأنيقة البسيطة', en: 'The Minimalist',
      desc: 'بتفضّلي التفاصيل الهادية اللي بتكمّل من غير ما تعلّي صوتها. الخاتم الناعم والسلسلة الرقيقة هما لغتك اليومية.',
      traits: ['خطوط ناعمة', 'تفاصيل هادئة', 'ذهب كلاسيكي'],
      styles: ['minimal', 'everyday'], tones: ['gold', 'silver'],
      icon: '<circle cx="60" cy="60" r="30" fill="none" stroke="#bd2b58" stroke-width="2"/><circle cx="60" cy="60" r="12" fill="none" stroke="#c69a5a" stroke-width="2"/>'
    },
    {
      id: 'sunshine', name: 'بنت الشمس', en: 'The Sunshine Girl',
      desc: 'طاقتك نور. بتحبي القطع اللي تدي اللوك دفء وبساطة مشرقة، وتلبسيها كل يوم من غير ما تفكري.',
      traits: ['دفء يومي', 'بساطة مشرقة', 'قطع خفيفة'],
      styles: ['everyday', 'romantic'], tones: ['gold'],
      icon: '<circle cx="60" cy="60" r="18" fill="none" stroke="#c69a5a" stroke-width="2"/><g stroke="#bd2b58" stroke-width="2" stroke-linecap="round"><path d="M60 22v10M60 88v10M22 60h10M88 60h10M33 33l7 7M80 80l7 7M87 33l-7 7M40 80l-7 7"/></g>'
    },
    {
      id: 'night', name: 'مُلهِمة الليل', en: 'The Night Muse',
      desc: 'لوكك بيلمع بعد المغرب. الكريستال والتفاصيل اللامعة بيعملوا الفرق في خروجتك المسائية.',
      traits: ['لمعة كريستال', 'تفاصيل مسائية', 'حضور قوي'],
      styles: ['night', 'elegant'], tones: ['gold', 'silver'],
      icon: '<path d="M76 20a44 44 0 1 0 24 60A40 40 0 0 1 76 20z" fill="none" stroke="#bd2b58" stroke-width="2"/><circle cx="88" cy="36" r="3" fill="#c69a5a"/><circle cx="96" cy="52" r="2.4" fill="#c69a5a"/>'
    },
    {
      id: 'romantic', name: 'الروح الرومانسية', en: 'The Romantic Soul',
      desc: 'قلوب، تفاصيل وردية، وقطعة بحجم صغير بتحكي كتير. الهدوء الناعم هو أقوى حضور عندك.',
      traits: ['تفاصيل وردية', 'لمسة رومانسية', 'قطع دلع'],
      styles: ['romantic', 'elegant'], tones: ['gold'],
      icon: '<path d="M60 92C34 74 20 60 20 44a20 20 0 0 1 40-9 20 20 0 0 1 40 9c0 16-14 30-40 48z" fill="none" stroke="#bd2b58" stroke-width="2"/><circle cx="60" cy="46" r="4" fill="#c69a5a"/>',
      pink: true
    },
    {
      id: 'bold', name: 'الجريئة', en: 'The Bold Statement',
      desc: 'بتحبي القطعة اللي تلفت النظر. الأشكال الجرافيكية والقطع الأكبر هي توقيعك.',
      traits: ['أشكال جرافيكية', 'قطع ملفتة', 'حضور جسور'],
      styles: ['bold', 'night'], tones: ['gold', 'silver'],
      icon: '<path d="M60 18l34 60-34 60-34-60z" fill="none" stroke="#bd2b58" stroke-width="2"/><path d="M60 44l14 34-14 34-14-34z" fill="#c69a5a" opacity="0.85"/>'
    }
  ];

  const QUIZ = [
    {
      id: 'style', q: 'إيه الستايل اللي بيوصفك أكتر؟',
      options: [
        { label: 'بسيط وهادي', hint: 'minimal & clean', weights: { minimalist: 3, sunshine: 1 } },
        { label: 'إليجانت وكلاسيك', hint: 'elegant & timeless', weights: { night: 2, romantic: 1, minimalist: 1 } },
        { label: 'رقيق ورومانسي', hint: 'soft & delicate', weights: { romantic: 3, sunshine: 1 } },
        { label: 'جريء وملفت', hint: 'bold & expressive', weights: { bold: 3, night: 1 } }
      ]
    },
    {
      id: 'when', q: 'بتلبسي الإكسسوار أكثر إمتى؟',
      options: [
        { label: 'كل يوم', hint: 'everyday', weights: { sunshine: 2, minimalist: 2 } },
        { label: 'الجامعة أو الشغل', hint: 'uni & work', weights: { minimalist: 2, sunshine: 1, bold: 1 } },
        { label: 'خروجات كاجوال', hint: 'casual outings', weights: { sunshine: 2, romantic: 2 } },
        { label: 'مناسبات وسهرات', hint: 'evenings', weights: { night: 3, bold: 1 } }
      ]
    },
    {
      id: 'tone', q: 'بتحبي اللون إيه؟',
      options: [
        { label: 'ذهبي', hint: 'gold tone', tone: 'gold', weights: { sunshine: 2, romantic: 1 } },
        { label: 'فضي', hint: 'silver tone', tone: 'silver', weights: { minimalist: 2, night: 1 } },
        { label: 'الاتنين', hint: 'both', tone: 'any', weights: { bold: 1, night: 1 } },
        { label: 'مفيش تفضيل', hint: 'no preference', tone: 'any', weights: {} }
      ]
    },
    {
      id: 'express', q: 'عايزة إكسسوارك يقول إيه عنك؟',
      options: [
        { label: 'البساطة', hint: 'simplicity', weights: { minimalist: 3 } },
        { label: 'الأناقة', hint: 'elegance', weights: { night: 2, minimalist: 1 } },
        { label: 'الشخصية', hint: 'personality', weights: { romantic: 2, bold: 1, sunshine: 1 } },
        { label: 'الثقة', hint: 'confidence', weights: { bold: 3 } }
      ]
    },
    {
      id: 'budget', q: 'ميزانيتك للقطعة الواحدة؟',
      options: [
        { label: 'اقتصادية', hint: 'أقل من 150 ج.م', budgetMax: 15000, weights: { sunshine: 1 } },
        { label: 'متوسطة', hint: '150 - 250 ج.م', budgetMax: 25000, weights: { minimalist: 1, romantic: 1 } },
        { label: 'أعلى شوية', hint: '250 - 350 ج.م', budgetMax: 35000, weights: { night: 1 } },
        { label: 'مرنة', hint: 'مش مهم السعر', budgetMax: 0, weights: { bold: 1 } }
      ]
    }
  ];

  const quiz = { index: 0, answers: [], result: null };

  function quizScore() {
    const scores = {};
    for (const p of PROFILES) scores[p.id] = 0;
    let tone = 'any';
    let budgetMax = 0;
    for (const a of quiz.answers) {
      if (!a) continue;
      for (const [k, v] of Object.entries(a.weights || {})) scores[k] = (scores[k] || 0) + v;
      if (a.tone) tone = a.tone;
      if (a.budgetMax) budgetMax = a.budgetMax;
    }
    let best = PROFILES[0];
    for (const p of PROFILES) if (scores[p.id] > scores[best.id]) best = p;
    return { profile: best, scores, tone, budgetMax };
  }

  function recommend(seedText) {
    const { profile, tone, budgetMax } = quizScore();
    const rnd = mulberry32(seedFrom(seedText));
    const scored = B.available().map(p => {
      let s = 0;
      const st = styleScore(p);
      for (const id of profile.styles) s += st[id] || 0;
      if (tone !== 'any') s += tonesOf(p).has(tone) ? 2 : -1;
      if (budgetMax) s += p.price <= budgetMax ? 1.5 : -2;
      if (p.featured) s += 0.5;
      return { p, s: s + rnd() * 0.6 };
    }).sort((a, b) => b.s - a.s);

    const picked = [];
    const perCat = {};
    for (const { p } of scored) {
      if (picked.length >= 4) break;
      if ((perCat[p.category_id] || 0) >= 2) continue;
      picked.push(p);
      perCat[p.category_id] = (perCat[p.category_id] || 0) + 1;
    }
    for (const { p } of scored) {
      if (picked.length >= 3) break;
      if (!picked.includes(p)) picked.push(p);
    }
    return { profile, tone, budgetMax, items: picked, limited: picked.length < 3 };
  }

  function renderQuizPanel() {
    const panel = $('#playPanel');

    if (quiz.result) {
      const r = quiz.result;
      const total = r.items.reduce((n, p) => n + p.price, 0);
      panel.innerHTML = `
        <div class="qz-result">
          <div class="qz-result-visual">
            <svg viewBox="0 0 120 120" aria-hidden="true">${r.profile.icon}</svg>
            <p class="en">${esc(r.profile.en)}</p>
            <p class="name">${esc(r.profile.name)}</p>
          </div>
          <div class="qz-result-body">
            <p>${esc(r.profile.desc)}</p>
            <div class="qz-traits">${r.profile.traits.map(t => `<span>${esc(t)}</span>`).join('')}</div>

            <p class="play-subhead">قطع مقترحة من كتالوج B (${r.items.length})</p>
            ${r.items.length
              ? `<div class="play-products">${r.items.map(p => productCard(p, { badge: toneLabel(p) })).join('')}</div>`
              : `<div class="play-empty"><p>مفيش قطع متاحة حالياً تناسب النتيجة. جربي تاني بعد تحديث المخزون.</p></div>`}
            ${r.limited ? `<p class="play-note" style="margin-top:10px;">الكتالوج المتاح حالياً محدود، فدي أقرب القطع لذوقك.</p>` : ''}

            <div class="girl-actions" style="margin-top:18px;">
              <button class="play-btn" id="qzShop" ${r.items.some(p => p.stock > 0) ? '' : 'disabled'}>
                تسوّقي ستايلك (${money(total)}) ＋
              </button>
              <button class="play-btn ghost" id="qzBox">جهّزي بوكس على نفس الستايل ✦</button>
              <button class="play-btn ghost" id="qzRestart">أعيدي الكويز ↺</button>
            </div>
            <p class="play-note" style="margin-top:14px;">✦ النتيجة دي تجربة اكتشاف ممتعة للستايل، ومبنية على قواعد ثابتة من بيانات المنتجات — مش تحليل بالذكاء الاصطناعي.</p>
          </div>
        </div>
      `;
      return;
    }

    const q = QUIZ[quiz.index];
    const answer = quiz.answers[quiz.index];
    const pct = Math.round((quiz.index) / QUIZ.length * 100);

    panel.innerHTML = `
      <div class="qz-progress">
        <div class="track"><i style="width:${pct}%"></i></div>
        <span>${quiz.index + 1} / ${QUIZ.length}</span>
      </div>
      <h4 class="qz-question">${esc(q.q)}</h4>
      <div class="qz-options" role="group" aria-label="${esc(q.q)}">
        ${q.options.map((o, i) => `
          <button class="qz-option ${answer === o ? 'active' : ''}" data-qz="${i}" aria-pressed="${answer === o}">
            <i aria-hidden="true">${['✦', '♡', '✧', '☀'][i % 4]}</i>
            <span><b>${esc(o.label)}</b><span>${esc(o.hint || '')}</span></span>
          </button>
        `).join('')}
      </div>
      <div class="qz-nav">
        <button class="play-btn ghost" id="qzBack" ${quiz.index === 0 ? 'disabled' : ''}>↺ السؤال السابق</button>
        <button class="play-btn" id="qzNext" ${answer ? '' : 'disabled'}>
          ${quiz.index === QUIZ.length - 1 ? 'اعرضي نتيجتي ✦' : 'السؤال التالي ↗'}
        </button>
      </div>
    `;
  }

  function quizStart() {
    quiz.index = 0;
    quiz.answers = [];
    quiz.result = null;
    B.track('personality_quiz_started', {});
    renderQuizPanel();
  }

  function quizFinish() {
    quiz.result = recommend(JSON.stringify(quiz.answers.map(a => a && a.label)));
    const r = quiz.result;
    try {
      localStorage.setItem('b2-quiz-result', JSON.stringify({
        profile: r.profile.id,
        name: r.profile.name,
        items: r.items.map(p => p.id),
        at: Date.now()
      }));
    } catch {}
    B.track('personality_quiz_completed', { profile: r.profile.id, recommendations: r.items.length });
    renderQuizPanel();
  }

  /* =======================================================================
     Experience router
     ======================================================================= */
  const EXPERIENCES = {
    catch: {
      eyebrow: 'CATCH THE ACCESSORIES',
      title: 'اِلتقطي الإكسسوارات 🎁',
      render: renderCatchPanel
    },
    box: {
      eyebrow: 'CREATE YOUR MYSTERY BOX',
      title: 'جهّزي صندوقك الغامض',
      render: renderBoxPanel
    },
    quiz: {
      eyebrow: 'ACCESSORY PERSONALITY',
      title: 'اكتشفي شخصية الإكسسوار',
      render: renderQuizPanel
    }
  };

  let current = '';

  function openExperience(key, options = {}) {
    if (key === 'girl') key = 'catch';      // old deep links keep working
    const exp = EXPERIENCES[key];
    if (!exp) return;
    cgHalt();
    current = key;

    if (key === 'box' && options.style) {
      mb.style = options.style;
      mb.view = 'wizard';
      mb.step = 1;
    }
    if (key === 'quiz' && options.restart) quizStart();

    const stage = $('#playStage');
    $('#playStageEyebrow').textContent = exp.eyebrow;
    $('#playStageTitle').textContent = exp.title;
    $('#playPanel').innerHTML = '<div class="play-loading"><i>✦</i> بنجهّز التجربة…</div>';
    stage.hidden = false;
    $$('#playHub .play-card').forEach(c => c.setAttribute('aria-expanded', String(c.dataset.play === key)));

    exp.render();

    stage.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  function closeExperience() {
    cgHalt();
    current = '';
    const stage = $('#playStage');
    if (stage) stage.hidden = true;
    const panel = $('#playPanel');
    if (panel) panel.innerHTML = '';
    $$('#playHub .play-card').forEach(c => c.setAttribute('aria-expanded', 'false'));
  }

  /* =======================================================================
     Events
     ======================================================================= */
  function bindEvents() {
    const hub = $('#playHub');
    if (hub) {
      hub.addEventListener('click', e => {
        const card = e.target.closest('[data-play]');
        if (!card) return;
        if (card.dataset.play === current) closeExperience();
        else openExperience(card.dataset.play);
      });
      hub.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const cards = $$('#playHub .play-card');
        const i = cards.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        const next = e.key === 'ArrowRight' ? (i + 1) % cards.length : (i - 1 + cards.length) % cards.length;
        cards[next].focus();
      });
    }

    $('#playClose')?.addEventListener('click', () => {
      closeExperience();
      $('#playHub .play-card')?.focus();
    });

    const panel = $('#playPanel');
    if (!panel) return;

    panel.addEventListener('click', async e => {
      const t = e.target;

      // --- Catch the Accessories ---
      if (t.closest('#cgStart')) { cgStart(); return; }
      if (t.closest('#cgPause')) { cgPause(); return; }
      if (t.closest('#cgResume')) { cgResume(); return; }
      if (t.closest('#cgRestart') || t.closest('#cgAgain')) { renderCatchPanel(); return; }
      if (t.closest('#cgForce')) { CG.forceMotion = true; renderCatchPanel(); return; }
      if (t.closest('#cgBack')) { cgBackToShop(); return; }
      if (t.closest('#cgShare')) { cgMakeShare(); return; }
      if (t.closest('#cgShareNow')) { cgShareNative(); return; }
      if (t.closest('#cgShareSave')) { cgShareDownload(); return; }
      if (t.closest('#cgSelectAll')) { cgSelectAll(); return; }
      if (t.closest('#cgAdd')) { cgAddSelected(); return; }
      const cgq = t.closest('[data-cgq]');
      if (cgq) { cgStep(cgq.dataset.cgq, Number(cgq.dataset.d)); return; }

      // --- Mystery box ---
      const budget = t.closest('[data-mbbudget]');
      if (budget) { mb.budget = Number(budget.dataset.mbbudget); mb.items = []; mb.view = 'wizard'; renderBoxPanel(); return; }

      if (t.closest('[data-mbstyle]')) {
        const btn = t.closest('[data-mbstyle]');
        mb.style = btn.dataset.mbstyle || '';
        renderBoxPanel();
        return;
      }
      const tone = t.closest('[data-mbtone]');
      if (tone) { mb.tone = tone.dataset.mbtone; renderBoxPanel(); return; }

      const cat = t.closest('[data-mbcat]');
      if (cat) {
        const id = cat.dataset.mbcat;
        mb.cats = mb.cats.includes(id) ? mb.cats.filter(x => x !== id) : [...mb.cats, id];
        mb.avoid = mb.avoid.filter(x => x !== id);
        renderBoxPanel();
        return;
      }
      const avoid = t.closest('[data-mbavoid]');
      if (avoid) {
        const id = avoid.dataset.mbavoid;
        mb.avoid = mb.avoid.includes(id) ? mb.avoid.filter(x => x !== id) : [...mb.avoid, id];
        mb.cats = mb.cats.filter(x => x !== id);
        renderBoxPanel();
        return;
      }
      if (t.closest('#mbGenerate')) { boxGenerate(); return; }
      if (t.closest('#mbBack')) { mb.view = 'wizard'; mb.swapFor = null; renderBoxPanel(); return; }
      if (t.closest('#mbAgain')) { boxGenerate('again-' + Date.now()); return; }
      if (t.closest('#mbAddMore')) {
        const extra = B.available()
          .filter(p => !mb.items.some(x => x.id === p.id))
          .filter(p => mb.tone === 'any' || tonesOf(p).has(mb.tone))
          .filter(p => !mb.avoid.includes(p.category_id))
          .filter(p => mb.items.reduce((n, x) => n + x.price, 0) + p.price <= mb.budget)
          .map(p => ({ p, s: (mb.style ? (styleScore(p)[mb.style] || 0) : 0) + (p.featured ? 0.4 : 0) }))
          .sort((a, b) => b.s - a.s)[0];
        if (!extra) { B.toast('مفيش قطعة إضافية في حدود الميزانية المتبقية'); return; }
        mb.items = [...mb.items, extra.p];
        renderBoxPanel();
        return;
      }
      const swap = t.closest('[data-mbswap]');
      if (swap) {
        const i = Number(swap.dataset.mbswap);
        mb.swapFor = mb.swapFor === i ? null : i;
        renderBoxPanel();
        return;
      }
      const pick = t.closest('[data-mbpick]');
      if (pick) {
        const [i, id] = pick.dataset.mbpick.split(':');
        const p = byId(id);
        if (p) {
          mb.items = mb.items.map((x, idx) => idx === Number(i) ? p : x);
          mb.swapFor = null;
          B.track('mystery_box_item_replaced', { item_id: p.id });
          renderBoxPanel();
        }
        return;
      }
      const rmv = t.closest('[data-mbremove]');
      if (rmv) {
        mb.items = mb.items.filter((_, i) => i !== Number(rmv.dataset.mbremove));
        mb.swapFor = null;
        renderBoxPanel();
        return;
      }
      if (t.closest('#mbAdd')) {
        if (!mb.items.length) return;
        B.track('mystery_box_add_to_cart', {
          currency: 'EGP',
          value: mb.items.reduce((n, p) => n + p.price, 0) / 100,
          items: B.trackItems(mb.items)
        });
        addToBag(mb.items, 'mystery_box');
        return;
      }

      // --- Quiz ---
      const opt = t.closest('[data-qz]');
      if (opt) {
        quiz.answers[quiz.index] = QUIZ[quiz.index].options[Number(opt.dataset.qz)];
        renderQuizPanel();
        return;
      }
      if (t.closest('#qzNext')) {
        if (!quiz.answers[quiz.index]) return;
        if (quiz.index === QUIZ.length - 1) quizFinish();
        else { quiz.index++; renderQuizPanel(); }
        return;
      }
      if (t.closest('#qzBack')) {
        if (quiz.index === 0) return;
        quiz.index--;
        renderQuizPanel();
        return;
      }
      if (t.closest('#qzRestart')) { quizStart(); return; }
      if (t.closest('#qzShop')) {
        const items = quiz.result ? quiz.result.items : [];
        if (items.length) addToBag(items, 'personality_quiz');
        return;
      }
      if (t.closest('#qzBox')) {
        const style = quiz.result ? quiz.result.profile.styles[0] : '';
        openExperience('box', { style });
        return;
      }

      // --- Shared: select a product inside the active experience ---
      const picked = t.closest('[data-pick]');
      if (picked) {
        const p = byId(picked.dataset.pick);
        if (p) addToBag([p], current);
        return;
      }

    });

    panel.addEventListener('change', e => {
      if (e.target.dataset && e.target.dataset.cgsel) {
        cgToggle(e.target.dataset.cgsel, e.target.checked);
        return;
      }
    });
  }

  /* =======================================================================
     Boot
     ======================================================================= */
  function start() {
    B = window.BStore;
    if (!B) return;

    initButterflies();
    initScrollStory();
    bindEvents();

    // Deep link: /?play=quiz or #play=quiz
    const params = new URLSearchParams(location.search);
    const key = params.get('play') || (location.hash.startsWith('#play=') ? location.hash.slice(6) : '');
    if (EXPERIENCES[key] || key === 'girl') {
      $('#play')?.scrollIntoView({ behavior: 'auto', block: 'start' });
      openExperience(key, { restart: false });
    }
  }

  if (window.BStore && window.BStore.ready) start();
  else window.addEventListener('bstore:ready', start, { once: true });
})();
