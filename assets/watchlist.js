/* Mi lista de seguimiento — lee los IDs guardados en localStorage */
(() => {
  'use strict';
  const WL_KEY = 'cf-watchlist:v1';
  const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const eur = n => fmt.format(n);
  const fmtInt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const el = {
    grid: $('grid'), count: $('count'), empty: $('empty'), status: $('status'),
    sort: $('sort'), clear: $('btnClearWl'), sub: $('wlSub'), toast: $('toast'),
    theme: $('btnTheme')
  };

  let PRODUCTS = [];
  let saved = [];
  const byId = new Map();

  function loadIds() {
    if (window.CFSync) return window.CFSync.read().ids;
    try { return JSON.parse(localStorage.getItem(WL_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveIds(ids) {
    if (window.CFSync) {
      window.CFSync.write({ ids, updated: new Date().toISOString() });
      return;
    }
    try { localStorage.setItem(WL_KEY, JSON.stringify(ids)); } catch (e) { /* ignore */ }
  }
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.toast.hidden = true; }, 2000);
  }

  function cardHTML(p) {
    const disc = p.disc >= 5 ? `<div class="card__pct">−${p.disc}%</div>` : '';
    const badges = (p.badges || []).filter(b => b !== '-40% en Cupón').slice(0, 2)
      .map(b => `<span class="cbadge" title="${esc(b)}">${esc(b)}</span>`).join('');
    const old = p.listPrice && p.listPrice > p.price ? `<div class="oldline"><s>${eur(p.listPrice)}</s></div>` : '';
    const priceBlock = !p.carrefour
      ? `<div class="price">${eur(p.price)}</div>${old}<div class="couponline couponline--off">Cupón no válido · terceros</div>`
      : `<div class="price price--coupon">${eur(p.couponPrice)} <small>con cupón</small></div>
         <div class="oldline">Precio hoy: <b>${eur(p.price)}</b></div>
         <div class="couponline">−40% <small>est. · 5–19 nov</small></div>`;
    const ships = [];
    if ((p.ships || []).includes('home')) ships.push('<span><i class="dot"></i>Envío</span>');
    if ((p.ships || []).includes('click')) ships.push('<span><i class="dot"></i>Recogida</span>');
    if ((p.ships || []).includes('express')) ships.push('<span><i class="dot"></i>Hoy</span>');

    return `<article class="card" role="listitem" data-id="${esc(p.id)}">
      <div class="card__media">
        ${disc}
        <a href="${p.url}" target="_blank" rel="noopener nofollow" tabindex="-1" aria-hidden="true">
          <img src="${p.img}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
        </a>
        ${badges ? `<div class="card__badges">${badges}</div>` : ''}
        <button class="card__fav is-on" type="button" data-watch="${esc(p.id)}"
          aria-pressed="true" aria-label="Quitar de mi lista" title="Quitar de mi lista">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.6 13a5.1 5.1 0 0 1 7.2-7.2l.2.2.2-.2A5.1 5.1 0 0 1 19.4 13L12 20.3Z"/></svg>
        </button>
      </div>
      <div class="card__body">
        <div class="card__brand">${esc(p.brandLabel)}</div>
        <h3 class="card__name"><a href="${p.url}" target="_blank" rel="noopener nofollow">${esc(p.name)}</a></h3>
        <div class="pricebox">${priceBlock}</div>
        ${ships.length ? `<div class="ship">${ships.join('')}</div>` : ''}
        <a class="cta" href="${p.url}" target="_blank" rel="noopener nofollow">Ver en Carrefour
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3Z"/><path d="M5 5h6v2H7v10h10v-4h2v6H5V5Z"/></svg>
        </a>
      </div>
    </article>`;
  }

  function sortList(list) {
    const by = {
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      'disc-desc': (a, b) => b.disc - a.disc || a.price - b.price,
      'name-asc': (a, b) => a.name.localeCompare(b.name, 'es'),
      'brand-asc': (a, b) => a.brandLabel.localeCompare(b.brandLabel, 'es') || a.name.localeCompare(b.name, 'es')
    };
    const mode = el.sort.value;
    if (by[mode]) list.sort(by[mode]);
    return list;
  }

  function render() {
    saved = loadIds();
    const items = sortList(saved.map(id => byId.get(id)).filter(Boolean));
    el.count.textContent = fmtInt(saved.length);
    const unit = document.getElementById('wlUnit');
    if (unit) unit.textContent = saved.length === 1 ? 'guardado' : 'guardados';
    el.empty.hidden = saved.length !== 0;
    el.grid.innerHTML = items.map(cardHTML).join('');
    el.status.textContent = saved.length
      ? `${fmtInt(items.length)} de ${fmtInt(saved.length)} productos del catálogo actual.`
      : '';
    el.clear.disabled = saved.length === 0;
    el.clear.style.opacity = saved.length === 0 ? '.5' : '1';
  }

  el.grid.addEventListener('click', e => {
    const b = e.target.closest('[data-watch]');
    if (!b) return;
    e.preventDefault();
    const id = b.dataset.watch;
    saveIds(loadIds().filter(x => x !== id));
    toast('Quitado de tu lista');
    render();
  });

  el.clear.addEventListener('click', () => {
    if (!loadIds().length) return;
    if (!confirm('¿Vaciar la lista completa?')) return;
    saveIds([]);
    toast('Lista vaciada');
    render();
  });

  el.sort.addEventListener('change', render);

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('cf-theme', t); } catch (e) { /* ignore */ }
  }
  el.theme.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  try {
    setTheme(localStorage.getItem('cf-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  } catch (e) { setTheme('light'); }

  window.addEventListener('cf-watchlist-change', () => render());

  /* ---------- panel de sincronización ---------- */
  const dlg = $('syncDlg');
  const body = $('syncBody');
  const btnSync = $('btnSync');

  function syncPanel() {
    if (!body) return;
    const tok = window.CFSync ? window.CFSync.token() : '';
    if (!tok) {
      body.innerHTML = `
        <p class="sync-note">Sincroniza la lista con otro móvil u ordenador usando un repositorio
        privado de GitHub. El token se guarda <b>solo en este navegador</b>.</p>
        <ol class="sync-steps">
          <li>Abre <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Crear token de acceso</a>.</li>
          <li><b>Repository access</b>: Only select repositories → <code>carrefour-juguetes-40-data</code>.</li>
          <li><b>Permissions → Contents</b>: <b>Read and write</b>.</li>
          <li>Genera el token y pégalo aquí.</li>
        </ol>
        <div class="sync-row">
          <input id="syncToken" type="password" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
          <button id="syncConnect" class="btn btn--primary" type="button">Conectar</button>
        </div>
        <p id="syncMsg" class="sync-msg"></p>`;
      $('syncConnect').addEventListener('click', async () => {
        const t = $('syncToken').value.trim();
        if (!t) return;
        window.CFSync.setToken(t);
        $('syncMsg').textContent = 'Comprobando…';
        try {
          await window.CFSync.pull();
          render();
          syncPanel();
        } catch (e) {
          window.CFSync.clearToken();
          $('syncMsg').textContent = 'No se pudo conectar: ' + e.message;
        }
      });
    } else {
      body.innerHTML = `
        <p class="sync-ok">✓ Sincronización activada</p>
        <p class="sync-note">La lista se guarda en el repositorio privado
        <code>carrefour-juguetes-40-data</code> y se comparte con los dispositivos que usen el mismo token.</p>
        <div class="sync-row">
          <button id="syncNow" class="btn btn--primary" type="button">Sincronizar ahora</button>
          <button id="syncOff" class="btn btn--ghost" type="button">Desconectar</button>
        </div>
        <p id="syncMsg" class="sync-msg"></p>`;
      $('syncNow').addEventListener('click', async () => {
        $('syncMsg').textContent = 'Sincronizando…';
        await window.CFSync.sync();
        render();
        $('syncMsg').textContent = 'Hecho';
      });
      $('syncOff').addEventListener('click', () => {
        window.CFSync.clearToken();
        syncPanel();
      });
    }
  }

  if (btnSync && dlg) {
    btnSync.addEventListener('click', () => { syncPanel(); dlg.showModal(); });
    if (window.CFSync) {
      window.CFSync.onChange(st => {
        const b = $('btnSync');
        if (!b) return;
        b.classList.toggle('is-synced', st.state === 'ok');
        b.classList.toggle('is-error', st.state === 'error');
        const msg = $('syncMsg');
        if (msg && st.message) msg.textContent = st.message;
      });
    }
  }

  (async () => {
    el.status.textContent = 'Cargando tu lista…';
    try {
      const res = await fetch('data/productos.json', { cache: 'no-cache' });
      const data = await res.json();
      PRODUCTS = data.productos.map(p => ({
        ...p,
        couponPrice: Math.round(p.price * 0.6 * 100) / 100
      }));
      for (const p of PRODUCTS) byId.set(p.id, p);
      if (window.CFSync && window.CFSync.token()) {
        try { await window.CFSync.pull(); } catch (e) { /* offline o token caducado */ }
      }
      if (data.meta && data.meta.generado) {
        el.sub.textContent = `Guardados en este navegador · catálogo de ${new Date(data.meta.generado)
          .toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })}.`;
      }
      render();
      document.title = `Mi lista (${fmtInt(loadIds().length)}) · 40% en Juguetes`;
    } catch (err) {
      el.status.textContent = 'No se pudo cargar el catálogo. Recarga la página.';
    }
  })();
})();
