# 40% en Juguetes · Carrefour

🔗 **Web:** https://aorgaz.github.io/carrefour-juguetes-40/

Explorador estático y responsive de la promoción **40% en Juguetes** de Carrefour
España. Sustituye la navegación tediosa de la web de Carrefour por un catálogo
con filtros, ordenación, scroll infinito y enlace directo a cada producto.

**2.437 juguetes** (todo lo que el listado pagina; a partir del offset 2.520 la
web devuelve páginas vacías, aunque el contador SEO anuncie ~3.000).

## Qué incluye

- **Catálogo completo** del listado `cat31813805` (2.437 juguetes) con nombre,
  marca, tipo, precio, PVP tachado, badges de promoción y tipo de entrega.
- **Precio con cupón**: el 40% calculado sobre el precio actual.
- **Filtros combinables**: texto libre, marca, tipo de juguete, rango de precio,
  descuento sobre PVP, otras promociones, vendedor y forma de entrega.
- **Ordenación** por relevancia, precio (asc/desc), descuento, precio con cupón,
  nombre y marca.
- **Scroll infinito** por lotes de 48 tarjetas y contador «mostrando X de Y».
- **Botón «Ver en Carrefour»** en cada tarjeta, a la ficha oficial del producto.
- **Lista de seguimiento**: corazón en cada ficha y página `watchlist.html` con
  todo lo guardado. Se persiste en `localStorage` (solo en ese navegador), con
  contador en la cabecera y sincronización entre pestañas.
- **Modo claro/oscuro**, persistencia de filtros en `localStorage` y diseño
  responsive (2 columnas en móvil, panel de filtros lateral en escritorio y
  cajón deslizante en móvil).

## La letra pequeña del 40% (importante)

Verificado en la ficha de la promoción el **02/11/2026**:

> Hasta el **04/11/2026**. Cupón canjeable del **05/11/2026 al 19/11/2026**
> (para compras superiores a **40 €**). Promoción **NO válida** para productos
> vendidos por terceros.

Es decir: **no es un descuento inmediato**. Compras ahora y recibes un cupón del
40% que se canjea en una compra posterior. La web muestra el precio con cupón
como **estimación** y avisa en los productos de marketplace de que el cupón no
aplica. El importe real del cupón depende de las bases de la promoción.

## Datos

`data/productos.json`:

```json
{
  "meta": { "total": 3023, "generado": "…", "condiciones": "…" },
  "productos": [
    {
      "id": "VC4A-34428370", "ean": "0191726756903", "sms": "767044",
      "name": "Pokémon Peluche Pikachu Dormilón 45 cm, +2 años",
      "brand": "pokemon", "brandLabel": "Pokémon",
      "cat": "Peluches", "catId": "33030",
      "price": 19.99, "listPrice": 49.99, "disc": 60,
      "img": "img/767044.jpg", "url": "https://www.carrefour.es/…/p",
      "ships": ["home", "click", "free"], "badges": ["-40% en Cupón"],
      "otherPromo": false, "carrefour": true, "seller": "Carrefour"
    }
  ]
}
```

- `disc`: descuento real sobre el PVP tachado que muestra Carrefour.
- `otherPromo`: badge promocional distinto del cupón del 40% (2ª unidad,
  envío gratis, descuento extra…).
- `carrefour`: `false` = vendido por terceros (marketplace); el cupón no aplica.
- La categoría (`cat`) se deduce del id interno `item_category` de Carrefour y
  del contenido de cada grupo; no es un campo que la web publique con nombre.

## Estructura

```
index.html                 app de una sola página
assets/styles.css          estilos (temas claro/oscuro, responsive)
assets/app.js              filtros, orden, scroll infinito, render
data/productos.json        catálogo
img/                       fotos de producto descargadas
scripts/                   pipeline de recolección
```

## Regenerar el catálogo

Requiere el **FlareSolverr** local (Carrefour está detrás de Cloudflare):

```bash
python3 scripts/scrape_carrefour.py    # baja listado → .cache/{html,raw,cards}
python3 scripts/build_data.py          # combina y escribe data/productos.json
python3 scripts/descargar_imagenes.py  # fotos → img/ y rutas locales
```

El scraper reutiliza una sesión de FlareSolverr y va a una página cada ~4 s.
**Truco clave:** Cloudflare bloquea `?offset=1032` pero no su versión con los
dígitos codificados (`?offset=%31%30%33%32`), que el servidor interpreta igual.
Así se bajan las 105 páginas sin que vetes la IP.

## Servir en local

```bash
python3 -m http.server 8137
# http://127.0.0.1:8137
```

Es estático: también vale GitHub Pages, Netlify o cualquier servidor de ficheros.

## Aviso

Proyecto personal de consulta. Los precios, el stock y las condiciones cambian;
la fuente de verdad es siempre la ficha de Carrefour enlazada desde cada tarjeta.
Sin afiliación con Carrefour.
