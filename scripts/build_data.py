"""Combina impressions + tarjetas y escribe data/productos.json.

Uso: python3 scripts/build_data.py
"""
import glob
import json
import os
import re
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache")
RAW = os.path.join(CACHE, "raw")
CARDS = os.path.join(CACHE, "cards")
OUT = os.path.join(ROOT, "data", "productos.json")
CATFILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "categorias.json")

COND = ("Cupón: compra hasta el 04/11/2026 y canjéalo del 05/11 al 19/11/2026, "
        "en compras superiores a 40 €. No válido en productos vendidos por terceros.")

BRANDS = {
    'lego': 'LEGO', 'vtech': 'VTech', 'hot-wheels': 'Hot Wheels', 'playmobil': 'Playmobil',
    'pokemon': 'Pokémon', 'bandai': 'Bandai', 'hasbro': 'Hasbro', 'spin-master': 'Spin Master',
    'crf': 'Carrefour', 'carrefour': 'Carrefour', 'paw-patrol': 'Paw Patrol',
    'monopoly': 'Monopoly', 'superthings': 'Superthings', 'barbie': 'Barbie', 'nerf': 'Nerf',
    'fisher-price': 'Fisher-Price', 'my-mini': 'My Mini', 'injusa': 'Injusa',
    'sylvanian-families': 'Sylvanian Families', 'bebes-llorones-tiny-cuddles': 'Bebés Llorones',
    'la-casa-de-munecas-de-gabby': "Gabby's Dollhouse", 'la-caja': 'La Caja',
    'kpop-demon-hunters': 'KPop Demon Hunters', 'spider-man': 'Spider-Man',
    '4d-build': '4D Build', 't-racers': 'T-Racers', 'bitzee': 'Bitzee', 'founier': 'Founier',
    'quick-stop': 'Quick Stop', 'yoshi': 'Yoshi',
}
MINOR = {'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'en', 'a'}


def brand_label(slug):
    if not slug:
        return 'Otros'
    if slug in BRANDS:
        return BRANDS[slug]
    words = re.split(r'[-_ ]+', slug.strip())
    return ' '.join(w if (i and w in MINOR) else w[:1].upper() + w[1:]
                    for i, w in enumerate(words))



PROPER = {
    'lego': 'LEGO', 'pokemon': 'Pokémon', 'funko': 'Funko', 'disney': 'Disney',
    'marvel': 'Marvel', 'star': 'Star', 'wars': 'Wars', 'hot': 'Hot', 'wheels': 'Wheels',
    'playmobil': 'Playmobil', 'vtech': 'VTech', 'nerf': 'Nerf', 'barbie': 'Barbie',
    'peppa': 'Peppa', 'pig': 'Pig', 'spider-man': 'Spider-Man', 'spiderman': 'Spider-Man',
    'superman': 'Superman', 'batman': 'Batman', 'harry': 'Harry', 'potter': 'Potter',
    'minecraft': 'Minecraft', 'roblox': 'Roblox', 'sonic': 'Sonic', 'mario': 'Mario',
    'zelda': 'Zelda', 'naruto': 'Naruto', 'dragon': 'Dragon', 'ball': 'Ball',
    'bluey': 'Bluey', 'paw': 'Paw', 'patrol': 'Patrol', 'frozen': 'Frozen',
    'princesas': 'Princesas', 'monopoly': 'Monopoly', 'hasbro': 'Hasbro',
    'spin': 'Spin', 'master': 'Master', 'bandai': 'Bandai', 'simba': 'Simba',
    'injusa': 'Injusa', 'fisher-price': 'Fisher-Price', 'bebés': 'Bebés',
    'lorones': 'Llorones', 'sylvanian': 'Sylvanian', 'families': 'Families',
    'gabby': 'Gabby', 'kpop': 'KPop', 'demon': 'Demon', 'hunters': 'Hunters',
    'stich': 'Stitch', 'stitch': 'Stitch', 'coca': 'Coca', 'cola': 'Cola',
}


FIXES = {
    'anos': 'años', 'ano': 'año', 'muneca': 'muñeca', 'munecas': 'muñecas',
    'muneco': 'muñeco', 'munecos': 'muñecos', 'bebe': 'bebé', 'bebes': 'bebés',
    'biberon': 'biberón', 'camion': 'camión', 'avion': 'avión', 'boton': 'botón',
    'raton': 'ratón', 'balon': 'balón', 'corazon': 'corazón', 'edicion': 'edición',
    'coleccion': 'colección', 'construccion': 'construcción', 'educacion': 'educación',
    'magico': 'mágico', 'telefono': 'teléfono', 'vehiculo': 'vehículo',
    'vehiculos': 'vehículos', 'helicoptero': 'helicóptero', 'arana': 'araña',
    'pizarron': 'pizarrón', 'jardin': 'jardín', 'pelicula': 'película',
    'bateria': 'batería', 'pila': 'pila', 'musica': 'música', 'robot': 'robot',
}
UNITS = {'cm', 'mm', 'kg', 'ml', 'pzs', 'pzas'}


def pretty_title(t):
    if not t:
        return t
    # Solo se toca si no hay mayúsculas internas (títulos tipo slug).
    if any(c.isupper() for c in t[1:]):
        return t
    out = []
    for i, w in enumerate(t.split(' ')):
        low = w.lower()
        core = low.rstrip(',.:;+')
        tail = low[len(core):]
        fixed = FIXES.get(core, core)
        if fixed in PROPER:
            word = PROPER[fixed]
        elif i and (fixed in MINOR or fixed in UNITS):
            word = fixed
        else:
            word = fixed[:1].upper() + fixed[1:]
        out.append(word + tail)
    return ' '.join(out)

def load_cats():
    if os.path.exists(CATFILE):
        return json.load(open(CATFILE))
    return {}


def main():
    cats = load_cats()
    imps = {}
    for f in glob.glob(os.path.join(RAW, "p*.json")):
        try:
            for it in json.load(open(f)):
                key = it.get('item_internal_id') or it.get('item_id')
                if key and key not in imps:
                    imps[key] = it
        except Exception as e:  # noqa: BLE001
            print('raw ilegible', f, e)
    cards = {}
    for f in glob.glob(os.path.join(CARDS, "p*.json")):
        try:
            for c in json.load(open(f)):
                slot = cards.setdefault(c['sku'], {})
                for k, v in c.items():
                    if v not in (None, '', []):
                        slot[k] = v
        except Exception as e:  # noqa: BLE001
            print('cards ilegible', f, e)

    products = []
    for sku, it in imps.items():
        c = cards.get(sku, {})
        name = c.get('title') or it.get('item_name', '').replace('-', ' ').strip().capitalize()
        price = c.get('price') or it.get('price')
        pvp = c.get('list_price')
        if not price:
            continue
        dto = round((1 - price / pvp) * 100) if pvp and pvp > price else 0
        badges = c.get('badges') or []
        ship_raw = it.get('item_shipping') or ''
        ships = []
        if 'home_delivery' in ship_raw:
            ships.append('home')
        if 'click_and_collect' in ship_raw:
            ships.append('click')
        if 'multipoint' in ship_raw:
            ships.append('multipoint')
        if 'express' in (c.get('features') or []):
            ships.append('express')
        if any(re.search(r'env[íi]o gratis', b, re.I) for b in badges):
            ships.append('free')

        promo_badges = [b for b in badges
                        if not re.search(r'^-?40\s*%\s*en\s*cup[oó]n$', b, re.I)]
        other = bool(promo_badges)   # badges fiables; el campo discount mezcla € y %

        sms = it.get('item_sms') or ''
        img = c.get('image') or (f"https://static.carrefour.es/hd_510x_/crs/cdn_static/"
                                f"catalog/hd/{sms}_00_1.jpg" if sms else '')
        url = c.get('url') or (f"https://www.carrefour.es/{it.get('item_name')}/"
                               f"{it.get('item_internal_id')}/p")
        provider = (it.get('item_provider_type') or it.get('item_provider') or '').lower()
        seller = c.get('seller') or ('Carrefour' if provider == 'carrefour' else provider or '')

        cat_id = str(it.get('item_category') or '')
        products.append({
            'id': sku,
            'ean': it.get('item_ean') or it.get('item_id') or '',
            'sms': sms,
            'name': re.sub(r'\s+', ' ', pretty_title(name)).strip(),
            'brand': (it.get('item_brand') or 'otros').strip().lower(),
            'brandLabel': brand_label((it.get('item_brand') or 'otros').strip().lower()),
            'cat': cats.get(cat_id, f'Cat. {cat_id}'),
            'catId': cat_id,
            'price': round(float(price), 2),
            'listPrice': round(float(pvp), 2) if pvp else None,
            'disc': dto,
            'img': img,
            'url': url,
            'ships': ships,
            'badges': badges,
            'otherPromo': bool(other),
            'carrefour': provider == 'carrefour' or seller.lower() == 'carrefour',
            'seller': seller,
        })

    products.sort(key=lambda p: p['name'])
    meta = {
        'total': len(products),
        'generado': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'fuente': 'https://www.carrefour.es/juguetes/40-cupon-en-juguetes-y-bicicletas/40-en-juguetes/cat31813805/c',
        'condiciones': COND,
        'conPvp': sum(1 for p in products if p['listPrice']),
        'marketplace': sum(1 for p in products if not p['carrefour']),
        'otraPromo': sum(1 for p in products if p['otherPromo']),
        'marcas': len({p['brand'] for p in products}),
        'categorias': len({p['cat'] for p in products}),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'meta': meta, 'productos': products}, open(OUT, 'w'),
              ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(meta, ensure_ascii=False, indent=1))
    print('escrito', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
