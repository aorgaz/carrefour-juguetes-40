"""Recolector del listado 40% en Juguetes de Carrefour (cat31813805).

Carrefour está detrás de Cloudflare: cada petición pasa por el FlareSolverr
local (http://127.0.0.1:8191). El ritmo es deliberadamente lento y reutiliza una
sesión; ir más rápido provoca el bloqueo de la IP.

Genera en .cache/:
  html/p<offset>.html     HTML crudo de cada página (reanudable)
  raw/p<offset>.json      window["impressions"] (datos de producto)
  cards/p<offset>.json    tarjetas parseadas (PVP, badges, vendedor)
"""
import json
import os
import random
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache")
HTML = os.path.join(CACHE, "html")
RAW = os.path.join(CACHE, "raw")
CARDS = os.path.join(CACHE, "cards")
for d in (HTML, RAW, CARDS):
    os.makedirs(d, exist_ok=True)

BASE = ("https://www.carrefour.es/juguetes/40-cupon-en-juguetes-y-bicicletas/"
        "40-en-juguetes/cat31813805/c")
STEP = 24
SESSION = "cfjuguetes"
FLARE = "http://127.0.0.1:8191/v1"


# ------------------------- parsing -------------------------
def extract_impressions(html):
    start = html.find('window["impressions"]=')
    if start < 0:
        return None
    start += len('window["impressions"]=')
    depth = 0
    for i in range(start, len(html)):
        c = html[i]
        if c == '[':
            depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                return json.loads(html[start:i + 1])
    return None


def extract_cards(page_html):
    import html as htmlmod
    import re

    def clean(s):
        s = re.sub(r'<[^>]+>', ' ', s)
        s = htmlmod.unescape(s)
        return re.sub(r'\s+', ' ', s).strip()

    def price(s):
        if not s:
            return None
        try:
            return float(s.replace('.', '').replace(',', '.'))
        except ValueError:
            return None

    out = []
    for ch in page_html.split('<li class="product-card-list__item"')[1:]:
        ch = ch.split('<li class="product-card-list__item"')[0]
        m = re.search(r'href="(/[^"]*?/(VC\w+-\d+)/p)"', ch)
        if not m:
            continue
        title = ''
        mt = re.search(r'class="product-card__title-link"[^>]*>(.*?)</a>', ch, re.S)
        if mt:
            title = clean(mt.group(1))
        cur = re.search(r'prices__price--current">\s*([\d.,]+)\s*€', ch) or re.search(
            r'prices__price">\s*([\d.,]+)\s*€', ch)
        old = re.search(r'prices__price--strikethrough">\s*([\d.,]+)\s*€', ch)
        badges = [b for b in (clean(x) for x in re.findall(
            r'class="badge__name"[^>]*>(.*?)</div>', ch, re.S)) if b]
        seller = ''
        ms = re.search(r'feature-seller__name"[^>]*>\s*(.*?)\s*</span>', ch, re.S)
        if ms:
            seller = clean(ms.group(1))
        feats = sorted(set(re.findall(r'feature-list__feature-([a-z-]+)', ch)))
        img = re.search(r'<img src="(https://static\.carrefour\.es/[^"]+)"', ch)
        out.append({
            'sku': m.group(2),
            'url': 'https://www.carrefour.es' + m.group(1),
            'title': title,
            'price': price(cur.group(1)) if cur else None,
            'list_price': price(old.group(1)) if old else None,
            'badges': badges,
            'seller': seller,
            'features': feats,
            'image': img.group(1).replace('/hd_350x_/', '/hd_510x_/') if img else '',
        })
    return out


# ------------------------- FlareSolverr -------------------------
def flare(payload, timeout=240):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(FLARE, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def ensure_session():
    try:
        flare({"cmd": "sessions.create", "session": SESSION}, 60)
    except Exception:
        pass


def drop_session():
    try:
        flare({"cmd": "sessions.destroy", "session": SESSION}, 60)
    except Exception:
        pass


class Blocked(Exception):
    pass


def fetch(url):
    d = flare({"cmd": "request.get", "url": url, "session": SESSION,
               "maxTimeout": 180000})
    msg = (d.get("message") or "").lower()
    if d.get("status") != "ok":
        if "blocked" in msg or "banned" in msg:
            raise Blocked(msg)
        raise RuntimeError(d.get("message"))
    return d["solution"]["response"]


def run_one(off, attempts=6):
    hp = os.path.join(HTML, f"p{off}.html")
    if os.path.exists(hp) and os.path.getsize(hp) > 10000:
        html = open(hp).read()
    else:
        url = BASE + (f"?offset={off}" if off else "")
        err = None
        for attempt in range(attempts):
            try:
                html = fetch(url)
                if len(html) < 10000:
                    raise RuntimeError(f"html corto ({len(html)})")
                tmp = hp + ".tmp"
                open(tmp, "w").write(html)
                os.replace(tmp, hp)
                break
            except Blocked as e:
                wait = 30 * (attempt + 1)
                print(f"  BLOQUEO en {off} (intento {attempt + 1}): espero {wait}s", flush=True)
                drop_session()
                time.sleep(wait)
                ensure_session()
                err = e
            except Exception as e:  # noqa: BLE001
                err = e
                wait = 5 + attempt * 10
                print(f"  ! {off} intento {attempt + 1}: {e} (espero {wait}s)", flush=True)
                time.sleep(wait)
        else:
            raise RuntimeError(f"{off}: {err}")

    imps = extract_impressions(html) or []
    cards = extract_cards(html)
    json.dump(imps, open(os.path.join(RAW, f"p{off}.json"), "w"), ensure_ascii=False)
    json.dump(cards, open(os.path.join(CARDS, f"p{off}.json"), "w"), ensure_ascii=False)
    return len(imps), len(cards)


def main():
    ensure_session()
    failed = []
    for i in range(0, 220):
        off = i * STEP
        try:
            ni, nc = run_one(off)
        except Exception as e:  # noqa: BLE001
            failed.append(off)
            print(f"  x offset {off}: {e}", flush=True)
            continue
        print(f"offset {off}: {ni} items / {nc} tarjetas", flush=True)
        if i and ni == 0:
            break
        time.sleep(random.uniform(3.2, 5.0))
    for off in list(failed):
        try:
            ni, nc = run_one(off)
            print(f"recuperado {off}: {ni}/{nc}", flush=True)
            failed.remove(off)
        except Exception as e:  # noqa: BLE001
            print(f"  sigue fallando {off}: {e}", flush=True)
    drop_session()
    json.dump({"failed": failed, "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
              open(os.path.join(CACHE, "status.json"), "w"), indent=1)
    print("FIN. fallidas:", failed, flush=True)


if __name__ == "__main__":
    main()
