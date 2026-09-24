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

## Asistente

«Nuevo…» abre un asistente que acompaña paso a paso hasta tener el mazo hecho:

1. **Tu juego**: nombre, tamaño de carta e idiomas.
2. **Tipos de carta** y cuántas de cada uno.
3. **Qué lleva cada carta**: ilustración, línea de tipo, reglas, ambientación, coste, atributos, rareza/clan/facción, número de colección. Un tipo puede ser «igual que» otro.
4. **Atributos y rareza**: nombre y color de cada atributo (números con icono), su orden en la carta (↑ ↓), cuáles lleva cada tipo (tabla de casillas), valores de la rareza, clan o facción.
5. **Diseño**: cuatro diseños base (clásico, ilustración completa, retrato, texto) dibujados con tu contenido.
6. **Ajustes**: paleta, tipografía, tamaño de la ilustración, lado de los atributos, esquina del coste, esquinas redondeadas.
7. **Ajuste fino** (opcional): color o transparencia, opacidad y borde de cada pieza (fondo, bandas, caja de texto, placa…), color, tamaño y alineación de cada texto (por defecto, centrados), alto de la caja de texto. Se pueden señalar las piezas sobre la carta.
8. **Traseras**: una para todas, una por tipo o ninguna.
9. **Cartas**: la tabla de cada tipo, una fila por carta, con la carta seleccionada dibujada al lado. Se puede **descargar un CSV para rellenar** (una columna por atributo, «;» para Excel) e **importar un CSV** (ese mismo, el del proyecto o uno propio: reconoce `nombre`, `texto`, `imagen`, `clan`…; avisa de tipos y columnas que no encajan).
10. **Imágenes**: elegir una carpeta y emparejarlas solas: (1) el archivo se llama como el id de la carta (`CRI-001.png`); (2) como su título (`guardian-de-ceniza.jpg`, sin importar mayúsculas, tildes ni espacios); (3) opcional: las demás por orden alfabético dentro de una subcarpeta con el nombre del tipo (`criatura/01.png`). Cada carta se puede corregir en la tabla. Las imágenes se copian a `assets/ilustraciones/`.
11. **Crear**: en una carpeta (Chrome/Edge), como .zip o de prueba sin guardar.

**Guardar progreso** descarga un `.asistente.json` con todas las respuestas y la tabla, para seguir otro día o en otro ordenador con **Cargar progreso…** (las imágenes no van en el archivo: al volver, se elige de nuevo la carpeta). Además, el borrador se guarda solo en el navegador.

Lo que no se rellena usa textos de ejemplo e imágenes provisionales, y el panel **Pendiente** de la galería dice qué falta.

Los diseños se prueban con todas las combinaciones de elementos, tamaños y ajustes: ningún texto en la zona peligrosa, sin solapes y con sitio mínimo para textos, iconos e ilustración.

## Flujo de trabajo

1. **Proyecto**: tamaño de carta, margen de seguridad, tipos de carta, catálogo de atributos (clave + icono) y fuentes. Avisa de las columnas que las plantillas usan y el CSV no tiene.
2. **Plantillas**: la anatomía de cada tipo. Añade zonas (imagen, texto, atributo fijo, lista de atributos) **trazando el rectángulo sobre la carta** (o con un clic, a tamaño por defecto); muévelas y redimensiónalas con imanes a bordes, centros, margen de seguridad y otras zonas. Las propiedades se editan a la derecha. Vista previa con cualquier carta del CSV o con datos de ejemplo.
3. **Cartas**: todas las cartas generadas, avisos y exportación (PNG/JPG + `manifest.json`). Solo se dibujan las miniaturas a la vista; el resto se comprueba en segundo plano para que la lista de avisos esté completa.

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
  "colors": { "comun": "#9aa7b8", "legendaria": "#f0b429" },
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

Exporta las cartas visibles (respeta el filtro) en PNG o JPG, a los ppp elegidos, siempre con sangrado. Formato, ppp y calidad JPG se guardan en `proyecto.json` (`"export": { "dpi": 300, "format": "png", "quality": 95 }`).

Destinos:

- **Descargar .zip**: el zip se genera en streaming, carta a carta; la memoria no crece con el tamaño del mazo. En Chrome/Edge se elige dónde guardarlo y se escribe directamente en disco.
- **Carpeta del proyecto** (Chrome/Edge con la carpeta abierta): escribe en `export/` (`export/<idioma>/` si hay varios idiomas). La carpeta refleja la última exportación: se borran los archivos que declaraba el `manifest.json` anterior y ya no se generan; nada más se toca.

Se puede cancelar en cualquier momento.

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
- **Color sRGB declarado**: el canvas dibuja en sRGB y cada archivo lo dice: PNG con `sRGB` + `gAMA` + `cHRM`; JPG con perfil ICC sRGB (el que incrusta el navegador o, si no pone ninguno, uno compacto CC0). Así el programa de maquetación no tiene que adivinarlo.
- **Píxeles exactos**: `ancho = round(ancho_mm · ppp / 25,4) + 2 · round(3 · ppp / 25,4)`. El corte cae en un píxel entero y el sangrado es idéntico en los cuatro lados (póker a 300 ppp: 744 × 1039 + 35 px por lado = 814 × 1109 px).

### Zonas

Comunes: `id`, `type`, `rect: {x, y, w, h}`, `bleed` (true = los bordes que tocan el borde de la carta se extienden hasta el sangrado; úsalo en el fondo), `hidden`, `locked` (no se selecciona con el ratón en el editor).

`showIf` (opcional): la zona solo se dibuja en las cartas que cumplen la condición. En el editor, las zonas que no se dibujan en la carta de vista previa aparecen rayadas.

| `showIf` | Se dibuja si |
|---|---|
| `rareza` | la columna tiene valor |
| `!rareza` | la columna está vacía |
| `rareza=legendaria` | vale eso (sin distinguir mayúsculas ni tildes); `legendaria\|épica` = cualquiera |
| `rareza!=común` | vale otra cosa o está vacía |

**image**: `bind` (columna), `default` (ruta), `fit`: `cover` | `contain` | `stretch`.

**text**: `bind`, `default`, `font`, `colorBind` (columna con el color del texto de cada carta), `align`: `left` | `center` | `right` | `justify`, `valign`: `top` | `middle` | `bottom`, `padding` (mm), `lineHeight` (1.2), `minSize` (pt: si el texto no cabe se reduce hasta aquí y, si aun así no cabe, aparece un aviso).

**attribute** (atributo fijo): `key` (clave del catálogo), `icon` (opcional, sustituye al del catálogo), `valuePosition`: `over` | `after` | `below` | `none`, `showIfMissing`, `font`. Se dibuja solo si la carta tiene ese atributo.

**attributes** (lista): `bind` (por defecto `atributos`), `direction`: `column` | `row`, `align`: `start` | `center` | `end`, `iconSize` (mm), `gap` (mm), `valuePosition`: `over` | `after` | `below`, `font`, `keys` (opcional: solo estos atributos, para repartirlos entre dos laterales).

**shape** (forma): `shape`: `rect` | `ellipse`, `fill` y `stroke` (color fijo o nombre de la paleta), `fillBind` y `strokeBind` (columna con el color de cada carta; `-` en la celda lo quita), `strokeWidth` (mm, se dibuja por dentro de la zona), `radius` (mm, esquinas), `opacity` (0–1). Para cintas, fondos de texto, gemas de rareza…

**font**: `family`, `size` (pt), `weight`, `style` (`italic`), `color`, `strokeColor`, `strokeWidth` (mm, contorno para leer sobre ilustraciones).

### Colores

Cualquier color admite un **nombre de la paleta** del proyecto (`"colors": { "fuego": "#c33", "legendaria": "#f0b429" }`) o un color CSS (`#c33`, `rgb(…)`, `crimson`). Con `fillBind`/`strokeBind`/`colorBind`, la celda del CSV decide el color de cada carta: una columna `rareza` con `legendaria` pinta de dorado. Un color que no se entiende genera un aviso.

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
  condition.ts    condiciones de las zonas (showIf)
  color.ts        paleta y colores desde el CSV
  render.ts       dibujo de una carta en canvas
  deck.ts         traseras, copias y qué se exporta
  pending.ts      lo que falta para terminar la baraja
  wizard/         asistente: respuestas, diseños base, ajuste fino, tabla CSV, emparejado de imágenes, generación del proyecto
  export.ts       PNG/JPG, nombres de archivo, manifiesto y zip
  metadata.ts     ppp y perfil sRGB en PNG/JPG
  assets.ts       lectura de archivos (carpeta, lista, URL) y caché de imágenes
src/lib/      componentes Svelte
  workspace.svelte.ts   estado: abrir, editar (inmutable), deshacer, guardar
  TemplateEditor / Stage / ZoneProps   editor de anatomía
  ProjectSettings                      configuración
  CardsView / CardDetail               galería, pendientes y exportación
  wizard/Wizard                        asistente de proyecto nuevo
```

## Próximos pasos

- Cerrar la convención de nombres y el manifiesto con el programa de PDF.
