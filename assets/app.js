/* Explorador 40% Juguetes Carrefour — vanilla JS, sin dependencias */
(() => {
  'use strict';

  const PAGE = 48;
  const COUPON = 0.40;
  const COUPON_MIN = 40;           // compra mínima para canjear el cupón
  const DEADLINE = new Date('2026-11-04T23:59:59+01:00');
  const LS_KEY = 'cf-juguetes-40:v1';
  const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const eur = n => fmt.format(n);
  const norm = s => (s || '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const $ = id => document.getElementById(id);
  const el = {
    q: $('q'), qClear: $('qClear'), grid: $('grid'), count: $('count'),
    status: $('status'), empty: $('empty'), sentinel: $('sentinel'),
    minRange: $('minRange'), maxRange: $('maxRange'), minNum: $('minNum'), maxNum: $('maxNum'),
    priceLabel: $('priceLabel'), dualFill: $('dualFill'),
    brandList: $('brandList'), catList: $('catList'), brandSearch: $('brandSearch'),
    discChips: $('discChips'), sort: $('sort'), activeChips: $('activeChips'),
    otherPromo: $('otherPromo'), showCoupon: $('showCoupon'), sellerOnly: $('sellerOnly'),
    filters: $('filters'), scrim: $('scrim'), btnFilters: $('btnFilters'),
    btnApply: $('btnApply'), btnCloseFilters: $('btnCloseFilters'), btnClear: $('btnClear'),
    filtersCount: $('filtersCount'), countdown: $('countdown'), toTop: $('toTop'),
    toast: $('toast'), btnTheme: $('btnTheme')
  };

  const state = {
    q: '', brands: new Set(), cats: new Set(), min: 0, max: 260, disc: 0,
    otherPromo: false, showCoupon: true, sellerOnly: false, ship: new Set(),
    sort: 'relevance', shown: PAGE, openBrands: false, openCats: false
  };

  let PRODUCTS = [];
  let META = {};
  let view = [];
  let io = null;
  let lastFocus = null;

  /* ---------- utilidades ---------- */
  const priceOf = p => state.showCoupon ? p.couponPrice : p.price;

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.toast.hidden = true; }, 2200);
  }

  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        q: state.q, brands: [...state.brands], cats: [...state.cats],
        min: state.min, max: state.max, disc: state.disc, otherPromo: state.otherPromo,
        sellerOnly: state.sellerOnly, ship: [...state.ship], sort: state.sort,
        showCoupon: state.showCoupon, openBrands: state.openBrands, openCats: state.openCats
      }));
    } catch (e) { /* modo privado */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      state.q = s.q || '';
      state.brands = new Set(s.brands || []);
      state.cats = new Set(s.cats || []);
      state.min = s.min ?? 0;
      state.max = s.max ?? 260;
      state.disc = s.disc || 0;
      state.otherPromo = !!s.otherPromo;
      state.sellerOnly = !!s.sellerOnly;
      state.ship = new Set(s.ship || []);
      state.sort = s.sort || 'relevance';
      state.showCoupon = s.showCoupon !== false;
      state.openBrands = !!s.openBrands;
      state.openCats = !!s.openCats;
    } catch (e) { /* ignore */ }
  }

  /* ---------- filtrado ---------- */
  function matches(p, skip) {
    if (state.q) {
      let ok = true;
      for (const w of state.q.split(/\s+/)) {
        if (w && !p.hay.includes(w)) { ok = false; break; }
      }
      if (!ok) return false;
    }
    if (skip !== 'brands' && state.brands.size && !state.brands.has(p.brand)) return false;
    if (skip !== 'cats' && state.cats.size && !state.cats.has(p.cat)) return false;
    const shown = (state.showCoupon && p.carrefour) ? p.couponPrice : p.price;
    if (shown < state.min || (state.max < 260 && shown > state.max)) return false;
    if (state.disc && p.disc < state.disc) return false;
    if (state.otherPromo && !p.otherPromo) return false;
    if (state.sellerOnly && !p.carrefour) return false;
    if (state.ship.size) {
      for (const s of state.ship) if (!p.ships.includes(s)) return false;
    }
    return true;
  }

  function applySort(list) {
    const by = {
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      'disc-desc': (a, b) => b.disc - a.disc || a.price - b.price,
      'coupon-asc': (a, b) => a.couponPrice - b.couponPrice,
      'name-asc': (a, b) => a.name.localeCompare(b.name, 'es'),
      'brand-asc': (a, b) => a.brand.localeCompare(b.brand, 'es') || a.name.localeCompare(b.name, 'es')
    };
    if (by[state.sort]) list.sort(by[state.sort]);
    return list;
  }

  /* ---------- render ---------- */
  function cardHTML(p) {
    const disc = p.disc >= 5 ? `<div class="card__pct">−${p.disc}%</div>` : '';
    const badges = p.badges.filter(b => b !== '-40% en Cupón').slice(0, 2)
      .map(b => `<span class="cbadge ${/env[íi]o gratis/i.test(b) ? 'cbadge--warm' : ''}" title="${esc(b)}">${esc(b)}</span>`).join('');
    const old = p.listPrice && p.listPrice > p.price
      ? `<div class="oldline"><s>${eur(p.listPrice)}</s></div>` : '';

    let priceBlock;
    if (!p.carrefour) {
      priceBlock = `<div class="price">${eur(p.price)}</div>${old}
        <div class="couponline couponline--off">Cupón no válido · vendido por terceros</div>`;
    } else if (state.showCoupon) {
      priceBlock = `<div class="price price--coupon">${eur(p.couponPrice)} <small>con cupón</small></div>
        <div class="oldline">Precio hoy: <b>${eur(p.price)}</b>${p.listPrice ? ` · PVP <s>${eur(p.listPrice)}</s>` : ''}</div>
        <div class="couponline">−40% <small>est. · 5–19 nov</small></div>`;
    } else {
      priceBlock = `<div class="price">${eur(p.price)}</div>${old}
        <div class="couponline">≈ ${eur(p.couponPrice)} <small>con cupón −40%</small></div>`;
    }

    const ships = [];
    if (p.ships.includes('home')) ships.push('<span><i class="dot"></i>Envío</span>');
    if (p.ships.includes('click')) ships.push('<span><i class="dot"></i>Recogida</span>');
    if (p.ships.includes('express')) ships.push('<span><i class="dot"></i>Hoy</span>');

    return `<article class="card" role="listitem" data-id="${p.id}">
      <div class="card__media">
        ${disc}
        <a href="${p.url}" target="_blank" rel="noopener nofollow" tabindex="-1" aria-hidden="true">
          <img src="${p.img}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
               onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23eef2f7%22/><text x=%2250%22 y=%2258%22 font-size=%2234%22 text-anchor=%22middle%22>%F0%9F%A7%B8</text></svg>'">
        </a>
        ${badges ? `<div class="card__badges">${badges}</div>` : ''}
      </div>
      <div class="card__body">
        <div class="card__brand">${esc(p.brandLabel)}</div>
        <h3 class="card__name"><a href="${p.url}" target="_blank" rel="noopener nofollow">${esc(p.name)}</a></h3>
        <div class="pricebox">${priceBlock}</div>
        ${ships.length ? `<div class="ship">${ships.join('')}</div>` : ''}
        <a class="cta" href="${p.url}" target="_blank" rel="noopener nofollow">
          Ver en Carrefour
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3Z"/><path d="M5 5h6v2H7v10h10v-4h2v6H5V5Z"/></svg>
        </a>
      </div>
    </article>`;
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function render(reset) {
    if (reset) {
      view = applySort(PRODUCTS.filter(p => matches(p)));
      state.shown = PAGE;
      el.grid.innerHTML = '';
      el.count.textContent = view.length.toLocaleString('es-ES');
      el.empty.hidden = view.length !== 0;
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    const slice = view.slice(state.shown - PAGE, state.shown);
    if (slice.length) {
      const frag = document.createElement('div');
      frag.innerHTML = slice.map(cardHTML).join('');
      el.grid.append(...frag.children);
    }
    updateStatus();
    renderActiveChips();
    renderFacetCounts();
    updateFiltersCount();
  }

  function updateStatus() {
    if (!view.length) { el.status.textContent = ''; return; }
    if (state.shown >= view.length) {
      el.status.innerHTML = `Has visto los <b>${view.length.toLocaleString('es-ES')}</b> juguetes de este filtro.`;
    } else {
      el.status.innerHTML = `<span class="spinner"></span>Mostrando ${state.shown} de ${view.length.toLocaleString('es-ES')}…`;
    }
  }

  function more() {
    if (state.shown >= view.length) return;
    const before = state.shown;
    state.shown = Math.min(state.shown + PAGE, view.length);
    render(false);
    if (state.shown > before) fillViewport();
  }

  // Si el centinela sigue a la vista tras añadir un lote (pantallas altas o
  // scroll instantáneo al fondo), el observer no vuelve a dispararse: seguimos
  // rellenando hasta cubrir el viewport.
  function fillViewport() {
    requestAnimationFrame(() => {
      if (state.shown >= view.length) return;
      const r = el.sentinel.getBoundingClientRect();
      if (r.top < window.innerHeight + 900) more();
    });
  }

  /* ---------- facetas ---------- */
  function facetData(key, skip) {
    const counts = new Map();
    for (const p of PRODUCTS) {
      if (!matches(p, skip)) continue;
      const k = p[key];
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  }

  function renderFacetCounts() {
    const labels = new Map(PRODUCTS.map(p => [p.brand, p.brandLabel]));
    const bFacet = facetData('brand', 'brands');
    const bShow = state.openBrands ? bFacet : bFacet.slice(0, 8);
    const qb = norm(el.brandSearch.value.trim());
    const bList = qb ? bFacet.filter(([k]) => norm(labels.get(k)).includes(qb)) : bShow;
    el.brandList.innerHTML = bList.map(([k, n]) => `
      <label class="check"><input type="checkbox" data-facet="brand" value="${esc(k)}" ${state.brands.has(k) ? 'checked' : ''}>
      <span>${esc(labels.get(k) || k)}</span><i class="n">${n}</i></label>`).join('');
    document.querySelector('[data-more="brands"]').textContent =
      state.openBrands ? 'Ver menos marcas' : `Ver todas las marcas (${bFacet.length})`;

    const cFacet = facetData('cat', 'cats');
    const cShow = state.openCats ? cFacet : cFacet.slice(0, 8);
    el.catList.innerHTML = cShow.map(([k, n]) => `
      <label class="check"><input type="checkbox" data-facet="cat" value="${esc(k)}" ${state.cats.has(k) ? 'checked' : ''}>
      <span>${esc(k)}</span><i class="n">${n}</i></label>`).join('');
    document.querySelector('[data-more="cats"]').textContent =
      state.openCats ? 'Ver menos tipos' : `Ver todos los tipos (${cFacet.length})`;

    el.brandList.classList.toggle('is-expanded', state.openBrands && !qb);
  }

  function renderActiveChips() {
    const out = [];
    if (state.q) out.push(['q', `“${state.q}”`]);
    for (const b of state.brands) out.push(['brand:' + b, b]);
    for (const c of state.cats) out.push(['cat:' + c, c]);
    if (state.disc) out.push(['disc', `≥${state.disc}% dto.`]);
    if (state.min > 0 || state.max < 260) out.push(['price', `${state.min}–${state.max >= 260 ? '∞' : state.max} €`]);
    if (state.otherPromo) out.push(['otherPromo', 'Con otra promo']);
    if (state.sellerOnly) out.push(['sellerOnly', 'Solo Carrefour']);
    for (const s of state.ship) out.push(['ship:' + s, ({ home: 'Envío', click: 'Recogida', free: 'Envío gratis', express: 'Entrega hoy' })[s]]);
    el.activeChips.innerHTML = out.map(([k, label]) => `
      <span class="achip"><span>${esc(label)}</span><button type="button" data-remove="${esc(k)}" aria-label="Quitar ${esc(label)}">×</button></span>`).join('');
  }

  function updateFiltersCount() {
    let n = state.brands.size + state.cats.size + state.ship.size;
    if (state.disc) n++;
    if (state.otherPromo) n++;
    if (state.sellerOnly) n++;
    if (state.q) n++;
    if (state.min > 0 || state.max < 260) n++;
    el.filtersCount.textContent = n;
    el.filtersCount.hidden = n === 0;
  }

  function updatePriceUI() {
    const lo = Number(el.minRange.value), hi = Number(el.maxRange.value);
    const a = Math.min(lo, hi - 1), b = Math.max(hi, lo + 1);
    el.dualFill.style.left = (a / 260 * 100) + '%';
    el.dualFill.style.width = ((b - a) / 260 * 100) + '%';
    el.minNum.value = state.min;
    el.maxNum.value = state.max >= 260 ? '' : state.max;
    el.priceLabel.textContent = `${state.min} € – ${state.max >= 260 ? 'sin límite' : state.max + ' €'}`
      + (state.showCoupon ? ' · cupón' : '');
  }

  /* ---------- eventos ---------- */
  let qTimer = 0;
  el.q.addEventListener('input', () => {
    clearTimeout(qTimer);
    el.qClear.hidden = !el.q.value;
    qTimer = setTimeout(() => { state.q = norm(el.q.value.trim()); render(true); save(); }, 160);
  });
  el.qClear.addEventListener('click', () => {
    el.q.value = ''; el.qClear.hidden = true; state.q = ''; render(true); save(); el.q.focus();
  });

  el.sort.addEventListener('change', () => { state.sort = el.sort.value; render(true); save(); });
  el.otherPromo.addEventListener('change', () => { state.otherPromo = el.otherPromo.checked; render(true); save(); });
  el.showCoupon.addEventListener('change', () => {
    state.showCoupon = el.showCoupon.checked; render(true); save();
    toast(state.showCoupon ? 'Precios con cupón −40% (estimado)' : 'Precios de hoy');
  });
  el.sellerOnly.addEventListener('change', () => { state.sellerOnly = el.sellerOnly.checked; render(true); save(); });

  document.querySelectorAll('[data-ship]').forEach(cb => cb.addEventListener('change', () => {
    const v = cb.dataset.ship;
    cb.checked ? state.ship.add(v) : state.ship.delete(v);
    render(true); save();
  }));

  el.discChips.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.disc = Number(b.dataset.disc);
    el.discChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('is-on', c === b));
    render(true); save();
  });

  function onRange() {
    let lo = Number(el.minRange.value), hi = Number(el.maxRange.value);
    if (lo > hi - 1) { if (document.activeElement === el.minRange) lo = hi - 1; else hi = lo + 1; }
    el.minRange.value = lo; el.maxRange.value = hi;
    state.min = lo; state.max = hi;
    updatePriceUI();
    clearTimeout(onRange._t);
    onRange._t = setTimeout(() => { render(true); save(); }, 120);
  }
  el.minRange.addEventListener('input', onRange);
  el.maxRange.addEventListener('input', onRange);
  [el.minNum, el.maxNum].forEach(inp => inp.addEventListener('change', () => {
    let lo = Math.max(0, Math.min(260, Number(el.minNum.value) || 0));
    let hi = el.maxNum.value === '' ? 260 : Math.max(0, Math.min(260, Number(el.maxNum.value) || 0));
    if (lo > hi) [lo, hi] = [hi, lo];
    state.min = lo; state.max = hi;
    el.minRange.value = lo; el.maxRange.value = hi;
    updatePriceUI(); render(true); save();
  }));

  document.querySelector('.filters__body').addEventListener('change', e => {
    const cb = e.target.closest('input[data-facet]'); if (!cb) return;
    const set = cb.dataset.facet === 'brand' ? state.brands : state.cats;
    cb.checked ? set.add(cb.value) : set.delete(cb.value);
    render(true); save();
  });

  el.brandSearch.addEventListener('input', renderFacetCounts);

  document.querySelectorAll('[data-more]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.more === 'brands') state.openBrands = !state.openBrands;
    else state.openCats = !state.openCats;
    renderFacetCounts(); save();
  }));

  el.activeChips.addEventListener('click', e => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    const k = b.dataset.remove;
    if (k === 'q') { el.q.value = ''; el.qClear.hidden = true; state.q = ''; }
    else if (k.startsWith('brand:')) state.brands.delete(k.slice(6));
    else if (k.startsWith('cat:')) state.cats.delete(k.slice(4));
    else if (k.startsWith('ship:')) {
      state.ship.delete(k.slice(5));
      const cb = document.querySelector(`[data-ship="${k.slice(5)}"]`); if (cb) cb.checked = false;
    }
    else if (k === 'disc') { state.disc = 0; el.discChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('is-on', c.dataset.disc === '0')); }
    else if (k === 'price') { state.min = 0; state.max = 260; el.minRange.value = 0; el.maxRange.value = 260; updatePriceUI(); }
    else if (k === 'otherPromo') { state.otherPromo = false; el.otherPromo.checked = false; }
    else if (k === 'sellerOnly') { state.sellerOnly = false; el.sellerOnly.checked = false; }
    render(true); save();
  });

  el.btnClear.addEventListener('click', () => {
    state.q = ''; el.q.value = ''; el.qClear.hidden = true;
    state.brands.clear(); state.cats.clear(); state.ship.clear();
    state.min = 0; state.max = 260; state.disc = 0;
    state.otherPromo = false; state.sellerOnly = false; state.sort = 'relevance';
    state.openBrands = state.openCats = false;
    el.minRange.value = 0; el.maxRange.value = 260;
    el.sort.value = 'relevance';
    el.otherPromo.checked = el.sellerOnly.checked = false;
    el.brandSearch.value = '';
    document.querySelectorAll('[data-ship]').forEach(c => { c.checked = false; });
    el.discChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('is-on', c.dataset.disc === '0'));
    updatePriceUI(); render(true); save();
    toast('Filtros borrados');
  });

  /* drawer móvil */
  function openFilters(open) {
    el.filters.classList.toggle('is-open', open);
    el.scrim.hidden = !open;
    document.body.classList.toggle('is-locked', open);
    el.btnFilters.setAttribute('aria-expanded', String(open));
    if (open) { lastFocus = document.activeElement; el.btnCloseFilters.focus(); }
    else if (lastFocus) lastFocus.focus();
  }
  el.btnFilters.addEventListener('click', () => openFilters(true));
  el.btnCloseFilters.addEventListener('click', () => openFilters(false));
  el.btnApply.addEventListener('click', () => openFilters(false));
  el.scrim.addEventListener('click', () => openFilters(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.filters.classList.contains('is-open')) openFilters(false); });

  /* tema */
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('cf-theme', t); } catch (e) {}
  }
  el.btnTheme.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  try {
    const saved = localStorage.getItem('cf-theme');
    setTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  } catch (e) { setTheme('light'); }

  /* volver arriba */
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      el.toTop.hidden = window.scrollY < 900;
      // Fallback del scroll infinito: si el centinela está cerca, cargar más.
      if (!el.sentinel.getBoundingClientRect || el.sentinel.getBoundingClientRect().top < window.innerHeight + 900) more();
      ticking = false;
    });
  }, { passive: true });
  el.toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* scroll infinito */
  function watchSentinel() {
    if (io) io.disconnect();
    io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) more();
    }, { rootMargin: '900px 0px' });
    io.observe(el.sentinel);
  }

  /* cuenta atrás */
  function tick() {
    const ms = DEADLINE - Date.now();
    if (ms <= 0) { el.countdown.textContent = 'Promo finalizada'; return; }
    const d = Math.floor(ms / 864e5);
    const h = Math.floor(ms % 864e5 / 36e5);
    el.countdown.textContent = d > 0 ? `Quedan ${d} d ${h} h` : `Quedan ${h} h`;
  }
  setInterval(tick, 60000); tick();

  /* ---------- arranque ---------- */
  async function boot() {
    load();
    el.q.value = state.q ? state.q : '';
    el.otherPromo.checked = state.otherPromo;
    el.showCoupon.checked = state.showCoupon;
    el.sellerOnly.checked = state.sellerOnly;
    el.sort.value = state.sort;
    el.minRange.value = state.min; el.maxRange.value = state.max;
    el.discChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('is-on', Number(c.dataset.disc) === state.disc));
    document.querySelectorAll('[data-ship]').forEach(c => { c.checked = state.ship.has(c.dataset.ship); });
    updatePriceUI();

    el.status.innerHTML = '<span class="spinner"></span>Cargando catálogo…';
    try {
      const res = await fetch('data/productos.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      META = data.meta || {};
      PRODUCTS = data.productos.map(p => ({
        ...p,
        brand: p.brand || 'otros',
        brandLabel: p.brandLabel || 'Otros',
        hay: norm(`${p.name} ${p.brandLabel} ${p.ean || ''} ${p.cat || ''}`),
        ships: p.ships || [],
        couponPrice: Math.round(p.price * (1 - COUPON) * 100) / 100,
        disc: p.disc || 0,
        otherPromo: !!p.otherPromo,
        carrefour: !!p.carrefour
      })).filter(p => p.price > 0);
      if (!PRODUCTS.length) throw new Error('catálogo vacío');
      el.qClear.hidden = !el.q.value;
      render(true);
      watchSentinel();
      fillViewport();
      document.title = `40% en Juguetes · ${PRODUCTS.length.toLocaleString('es-ES')} ofertas · Carrefour`;
    } catch (err) {
      el.status.innerHTML = `No se pudo cargar el catálogo (${esc(err.message)}). Recarga la página.`;
      console.error(err);
    }
  }

  boot();
})();
