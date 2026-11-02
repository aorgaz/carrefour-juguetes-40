"""Descarga las imágenes de producto al repo y reescribe el JSON con rutas locales.

Uso: python3 descargar_imagenes.py <ruta/data/productos.json>
Idempotente: salta las que ya existen.
"""
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36")


def descargar(args) -> tuple[str, str]:
    url, dest = args
    if os.path.exists(dest) and os.path.getsize(dest) > 400:
        return dest, 'skip'
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': UA,
                'Referer': 'https://www.carrefour.es/',
                'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
            })
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            if len(data) < 400:
                raise ValueError(f'imagen diminuta ({len(data)} bytes)')
            tmp = dest + '.tmp'
            open(tmp, 'wb').write(data)
            os.replace(tmp, dest)
            return dest, 'ok'
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                return dest, f'ERR {e}'
            time.sleep(1 + attempt * 2)


def main(path):
    data = json.load(open(path))
    root = os.path.dirname(os.path.dirname(os.path.abspath(path)))
    imgdir = os.path.join(root, 'img')
    os.makedirs(imgdir, exist_ok=True)

    jobs = []
    for p in data['productos']:
        if not p.get('img') or p['img'].startswith('img/'):
            continue
        key = p.get('sms') or p['id'].replace('/', '_')
        dest = os.path.join(imgdir, f'{key}.jpg')
        jobs.append((p['img'], dest))

    print(f'{len(jobs)} imágenes por descargar')
    stats = {}
    mapping = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, (dest, status) in enumerate(pool.map(descargar, jobs), 1):
            name = os.path.basename(dest)
            mapping[name] = status
            key = status.split()[0] if status else 'ok'
            stats[key] = stats.get(key, 0) + 1
            if i % 250 == 0:
                print(f'  {i}/{len(jobs)} · {stats}', flush=True)

    ok = {n for n, s in mapping.items() if s in ('ok', 'skip')}
    for p in data['productos']:
        key = p.get('sms') or p['id'].replace('/', '_')
        if f'{key}.jpg' in ok:
            p['img'] = f'img/{key}.jpg'
            p['imgLocal'] = True

    json.dump(data, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('stats:', stats)
    print('sin imagen local:', sum(1 for p in data['productos'] if not p.get('imgLocal')))
    print('JSON actualizado:', path)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'data/productos.json')
