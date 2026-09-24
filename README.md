# Creador de cartas

Genera cartas a partir de un CSV y de plantillas (una por `tipo`). Exporta PNG/JPG a tamaño completo con sangrado y con los ppp escritos en el archivo. Todo corre en el navegador: nada se sube a ningún servidor.

```bash
npm install
npm run dev          # http://localhost:5173  (…/#ejemplo abre el ejemplo)
npm run build        # versión estática en dist/
npm test             # pruebas del núcleo (Vitest)
npm run check        # tipos
```

Cada push a `main` se publica en GitHub Pages (`.github/workflows/pages.yml`; hay que activar **Settings → Pages → Source: GitHub Actions** una vez). `dist/` funciona en cualquier hosting estático con HTTPS.

## Flujo de trabajo

1. **Proyecto**: tamaño de carta, margen de seguridad, tipos de carta, catálogo de atributos (clave + icono) y fuentes. Avisa de las columnas que las plantillas usan y el CSV no tiene.
2. **Plantillas**: la anatomía de cada tipo. Añade zonas (imagen, texto, atributo fijo, lista de atributos) **trazando el rectángulo sobre la carta** (o con un clic, a tamaño por defecto); muévelas y redimensiónalas con imanes a bordes, centros, margen de seguridad y otras zonas. Las propiedades se editan a la derecha. Vista previa con cualquier carta del CSV o con datos de ejemplo.
3. **Cartas**: todas las cartas generadas, avisos y exportación (PNG/JPG + `manifest.json` en un .zip).

Guardar (⌘S) escribe `proyecto.json` en la carpeta; si el navegador no puede escribir (Safari/Firefox o el ejemplo), lo descarga. ⌘Z / ⇧⌘Z deshacen y rehacen.

«Nuevo…» crea `proyecto.json` y `cartas.csv` en una carpeta (Chrome/Edge). «Abrir…» funciona en todos los navegadores; en Chrome/Edge además se puede **recargar**, activar **auto** (relee el CSV al guardarlo desde Excel) y subir imágenes a `assets/` con el botón ↥.

## Estructura de un proyecto

```
mi-juego/
├── proyecto.json    plantillas, atributos, tamaño de carta
├── cartas.csv
└── assets/          imágenes y fuentes (las rutas se escriben relativas a esta carpeta)
```

Mira [public/ejemplo/](public/ejemplo/) como referencia completa.

## CSV

- Obligatorias: `id`, `tipo`. El resto son libres: una zona de la plantilla se vincula a cualquier columna.
- Las cabeceras ignoran mayúsculas y tildes (`Descripción-ES` = `descripcion-es`).
- **Idiomas**: `titulo-es`, `titulo-en`… La zona se vincula a `titulo` y el idioma se elige en la barra superior.
- **Imágenes** (`fondo`, `cabecera`, `bloque 1`…): vacío = la imagen por defecto de la plantilla; una ruta = sustituirla en esta carta; `-` = no dibujar.
- **trasera**: `id` de otra carta del CSV. Vacía = la trasera por defecto de la plantilla; `-` = sin trasera.
- **copias**: cuántas copias lleva el mazo (vacía = 1; `0` = no se exporta). No duplica imágenes: va al manifiesto.
- Separador `,` o `;` (se detecta solo). Codificación UTF-8 recomendada.

### Atributos

```
fuerza:3 | velocidad:5 | vida:10
```

- El orden de la celda es el orden de dibujo. Puede haber cuantos quieras.
- El valor es texto libre (`ataque:X`, `daño:1d6`) u omitible (`escudo`).
- Icono distinto solo en esta carta: `vida:10@iconos/corazon-roto.svg`.

### Marcado en textos

| Escribes | Resultado |
|---|---|
| `**texto**` | negrita |
| `*texto*` | cursiva |
| `{fuerza}` | icono del atributo dentro del texto |
| salto de línea, `\n` o `<br>` | nuevo párrafo |

## proyecto.json

```jsonc
{
  "name": "Mi juego",
  "csv": "cartas.csv",
  "assetsDir": "assets",
  "card": { "width": 63, "height": 88, "safe": 3 },   // mm, tamaño al corte
  "fonts": [{ "family": "Cinzel", "file": "fuentes/Cinzel-Bold.ttf", "weight": "bold" }],
  "attributes": {
    "fuerza": { "icon": "iconos/fuerza.svg", "label": "Fuerza" }
  },
  "templates": {
    "nave": {                       // = valor de la columna tipo
      "size": { "height": 120 },    // opcional: otro tamaño para este tipo
      "back": "D01",                // opcional: trasera por defecto (id de una carta del CSV)
      "zones": [ … ]                // se dibujan en orden: la primera queda al fondo
    }
  }
}
```

Coordenadas en mm desde la esquina del **corte** (el sangrado queda en negativo).

## Exportación

Exporta las cartas visibles (respeta el filtro) en PNG o JPG, a los ppp elegidos, siempre con sangrado:

- Cada imagen se genera **una sola vez**. Las cartas que otras usan como trasera (y no tienen trasera propia) se exportan como traseras, no como cartas, aunque el filtro no las incluya.
- Nombre de archivo: el `id` (más `_es`, `_en`… si el CSV tiene varios idiomas). Si dos ids dan el mismo nombre, el segundo lleva `-2`.
- `manifest.json` enlaza anverso, trasera y copias, y describe el tamaño exacto de cada imagen:

```jsonc
{
  "schema": "creador-de-cartas/manifest", "version": 1, "provisional": true,
  "project": "…", "exportedAt": "…", "lang": "es", "dpi": 300, "format": "png", "bleedMm": 3,
  "cards": [
    { "id": "N01", "tipo": "nave", "copies": 3, "front": "N01_es.png", "back": "D01_es.png" }
  ],
  "images": {
    "N01_es.png": { "id": "N01", "tipo": "nave", "trimMm": { "width": 63, "height": 88 }, "safeMm": 3,
                    "px": { "trimWidth": 744, "trimHeight": 1039, "bleed": 35, "width": 814, "height": 1109 } }
  }
}
```

> **Provisional**: la convención de nombres y el formato del manifiesto se cerrarán junto con el programa que monta los PDF para imprenta.

## Sangrado y zonas de impresión

- **Sangrado fijo de 3 mm** por lado, siempre incluido al exportar. Si la imprenta pide menos, se recorta después.
- **Zona peligrosa**: la franja entre el corte y el margen de seguridad (`safe`, 3 mm por defecto). Los textos y atributos que entran en ella generan un aviso y se marcan en rojo en el editor; las imágenes no cuentan (fondos y marcos llegan al borde a propósito).
- **Píxeles exactos**: `ancho = round(ancho_mm · ppp / 25,4) + 2 · round(3 · ppp / 25,4)`. El corte cae en un píxel entero y el sangrado es idéntico en los cuatro lados (póker a 300 ppp: 744 × 1039 + 35 px por lado = 814 × 1109 px).

### Zonas

Comunes: `id`, `type`, `rect: {x, y, w, h}`, `bleed` (true = los bordes que tocan el borde de la carta se extienden hasta el sangrado; úsalo en el fondo), `hidden`, `locked` (no se selecciona con el ratón en el editor).

**image**: `bind` (columna), `default` (ruta), `fit`: `cover` | `contain` | `stretch`.

**text**: `bind`, `default`, `font`, `align`: `left` | `center` | `right` | `justify`, `valign`: `top` | `middle` | `bottom`, `padding` (mm), `lineHeight` (1.2), `minSize` (pt: si el texto no cabe se reduce hasta aquí y, si aun así no cabe, aparece un aviso).

**attribute** (atributo fijo): `key` (clave del catálogo), `icon` (opcional, sustituye al del catálogo), `valuePosition`: `over` | `after` | `below` | `none`, `showIfMissing`, `font`. Se dibuja solo si la carta tiene ese atributo.

**attributes** (lista): `bind` (por defecto `atributos`), `direction`: `column` | `row`, `align`: `start` | `center` | `end`, `iconSize` (mm), `gap` (mm), `valuePosition`: `over` | `after` | `below`, `font`, `keys` (opcional: solo estos atributos, para repartirlos entre dos laterales).

**font**: `family`, `size` (pt), `weight`, `style` (`italic`), `color`, `strokeColor`, `strokeWidth` (mm, contorno para leer sobre ilustraciones).

## Código

```
src/core/     lógica sin interfaz (se podría pasar a WASM sin tocar la UI)
  types.ts        modelo de datos
  card.ts         sangrado fijo, píxeles exactos, zona peligrosa
  zones.ts        zonas nuevas por defecto, tamaños de carta
  geometry.ts     arrastre, redimensionado e imanes
  project.ts      carga de proyecto.json + CSV
  csv.ts          lectura del CSV, idiomas
  attributes.ts   sintaxis de atributos
  render.ts       dibujo de una carta en canvas
  deck.ts         traseras, copias y qué se exporta
  export.ts       PNG/JPG, nombres de archivo, manifiesto y zip
  dpi.ts          escribe los ppp en PNG/JPG
  assets.ts       lectura de archivos (carpeta, lista, URL) y caché de imágenes
src/lib/      componentes Svelte
  workspace.svelte.ts   estado: abrir, editar (inmutable), deshacer, guardar
  TemplateEditor / Stage / ZoneProps   editor de anatomía
  ProjectSettings                      configuración
  CardsView / CardDetail               galería y exportación
```

## Próximos pasos

- Cerrar la convención de nombres y el manifiesto con el programa de PDF.
- Exportar en segundo plano (Web Worker + OffscreenCanvas) y escribir el lote por partes o directamente en la carpeta del proyecto, para mazos grandes.
- Carga diferida de miniaturas para mazos grandes.
