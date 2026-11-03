/* Sincronización de la lista de seguimiento entre dispositivos.
 *
 * Almacén: un fichero watchlist.json en un repo privado de GitHub del usuario.
 * Autenticación: token fine-grained que se guarda SOLO en este navegador
 * (localStorage), nunca se envía a otro sitio que no sea api.github.com.
 *
 * Formato local: { ids: [ ... ], updated: ISO }
 */
(() => {
  'use strict';

  const WL_KEY = 'cf-watchlist:v1';
  const TOKEN_KEY = 'cf-sync-token:v1';
  const REPO = 'aorgaz/carrefour-juguetes-40-data';
  const PATH = 'watchlist.json';
  const API = `https://api.github.com/repos/${REPO}/contents/${PATH}`;

  let status = { state: 'idle', message: '', last: null };
  const listeners = new Set();
  let pushTimer = null;
  let busy = false;

  const emit = () => listeners.forEach(fn => { try { fn({ ...status }); } catch (e) { /* ignore */ } });

  function setStatus(state, message, last) {
    status = { state, message, last: last ?? status.last };
    emit();
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setToken(t) {
    try { localStorage.setItem(TOKEN_KEY, t.trim()); } catch (e) { /* ignore */ }
    emit();
  }

  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    status = { state: 'idle', message: '', last: null };
    emit();
  }

  function read() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(WL_KEY) || 'null'); } catch (e) { raw = null; }
    if (Array.isArray(raw)) return { ids: raw, updated: '' };          // formato antiguo
    if (raw && Array.isArray(raw.ids)) return { ids: raw.ids, updated: raw.updated || '' };
    return { ids: [], updated: '' };
  }

  function write(state, opts) {
    const clean = {
      ids: [...new Set(state.ids || [])],
      updated: state.updated || new Date().toISOString()
    };
    try { localStorage.setItem(WL_KEY, JSON.stringify(clean)); } catch (e) { /* ignore */ }
    window.dispatchEvent(new CustomEvent('cf-watchlist-change', { detail: clean }));
    if (!(opts && opts.noPush)) pushSoon();
    return clean;
  }

  /* ---------- GitHub ---------- */
  function headers() {
    return {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
  }

  const b64encode = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  const b64decode = s => decodeURIComponent(escape(atob(s.replace(/\s/g, ''))));

  async function ghGet() {
    const r = await fetch(`${API}?t=${Date.now()}`, { headers: headers(), cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403
      ? 'El token no es válido o no tiene permiso de Contents.'
      : `GitHub respondió ${r.status}`);
    const j = await r.json();
    return { sha: j.sha, data: JSON.parse(b64decode(j.content)) };
  }

  async function ghPut(data, sha) {
    const body = {
      message: 'Actualizar lista de seguimiento',
      content: b64encode(data)
    };
    if (sha) body.sha = sha;
    const r = await fetch(API, { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) {
      let msg = `GitHub respondió ${r.status}`;
      try { const e = await r.json(); if (e.message) msg = e.message; } catch (x) { /* ignore */ }
      throw new Error(msg);
    }
    return r.json();
  }

  /* ---------- sincronización ---------- */
  async function pull() {
    if (!token()) return read();
    setStatus('syncing', 'Comprobando cambios…');
    const local = read();
    const remote = await ghGet();
    const lt = Date.parse(local.updated || 0) || 0;
    const rt = Date.parse(remote.data.updated || 0) || 0;
    if (rt > lt) {
      write({ ids: remote.data.ids || [], updated: remote.data.updated }, { noPush: true });
      setStatus('ok', 'Lista actualizada desde otro dispositivo', new Date());
      return read();
    }
    if (lt > rt) {
      write(local, { noPush: true });  // normaliza y evita rebotes
      await ghPut(local, remote.sha);
      setStatus('ok', 'Cambios subidos', new Date());
      return local;
    }
    setStatus('ok', 'Al día', new Date());
    return local;
  }

  async function pushNow() {
    if (!token() || busy) return;
    busy = true;
    try {
      const local = read();
      setStatus('syncing', 'Guardando en la nube…');
      let remote = await ghGet();
      const rt = Date.parse(remote.data.updated || 0) || 0;
      const lt = Date.parse(local.updated || 0) || 0;
      let payload = local;
      if (rt > lt) {
        // Otro dispositivo escribió después: unimos para no perder nada.
        const merged = [...new Set([...(remote.data.ids || []), ...local.ids])];
        payload = { ids: merged, updated: new Date().toISOString() };
        write(payload, { noPush: true });
        window.dispatchEvent(new CustomEvent('cf-watchlist-change', { detail: payload }));
      }
      await ghPut(payload, remote.sha);
      setStatus('ok', 'Guardado en la nube', new Date());
    } catch (e) {
      setStatus('error', e.message || 'No se pudo sincronizar');
    } finally {
      busy = false;
    }
  }

  function pushSoon() {
    if (!token()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 1200);
  }

  async function sync() {
    try {
      await pull();
    } catch (e) {
      setStatus('error', e.message || 'No se pudo sincronizar');
    }
  }

  function onChange(fn) { listeners.add(fn); fn({ ...status }); return () => listeners.delete(fn); }

  window.CFSync = { read, write, sync, pull, pushNow, token, setToken, clearToken, onChange };
})();
