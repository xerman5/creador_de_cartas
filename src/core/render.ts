import { parseAttributes } from './attributes';
import { cardPixels, cardSizeFor, type CardPixels } from './card';
import { pickColor, resolveColor } from './color';
import { conditionMatches } from './condition';
import { coverRect, parseCrop } from './crop';
import type { LoadedProject } from './project';
import { getField, normalizeKey } from './text';
import type {
  AttributeZone,
  AttributesZone,
  CardRow,
  CardSize,
  FontSpec,
  ImageZone,
  Project,
  Rect,
  ShapeZone,
  Template,
  TextZone,
  Zone,
  ZoneType,
} from './types';

export interface RenderOptions {
  dpi: number;
  lang: string;
  /** Incluir el sangrado en el lienzo (la exportación siempre lo incluye). */
  bleed: boolean;
  /** Señalar sangrado, corte, zona peligrosa y margen de seguridad. */
  guides?: boolean;
  /** Dibujar el contorno de cada zona (para diseñar la anatomía). */
  zones?: boolean;
  /** Resaltar estas zonas (por id): el resto de la carta se oscurece. */
  focus?: string[];
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  warnings: string[];
}

interface Ctx {
  ctx: CanvasRenderingContext2D;
  /** Píxeles por milímetro. */
  k: number;
  row: CardRow;
  lp: LoadedProject;
  opts: RenderOptions;
  size: CardSize;
  px: CardPixels;
  warnings: string[];
}

const ptToMm = (pt: number) => (pt * 25.4) / 72;

export function templateFor(project: Project, row: CardRow): Template | undefined {
  return project.templates[normalizeKey(row.tipo ?? '')];
}

/** Se dibuja siempre en un lienzo nuevo para que renders concurrentes no se pisen. */
export async function renderCard(row: CardRow, lp: LoadedProject, opts: RenderOptions): Promise<RenderResult> {
  const warnings: string[] = [];
  const tpl = templateFor(lp.project, row);
  const size = cardSizeFor(lp.project, tpl);
  const k = opts.dpi / 25.4;
  const px = cardPixels(size, opts.dpi);
  const offset = opts.bleed ? px.bleed : 0;

  const canvas = document.createElement('canvas');
  canvas.width = px.trimWidth + 2 * offset;
  canvas.height = px.trimHeight + 2 * offset;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Origen en la esquina del corte; el sangrado queda en coordenadas negativas.
  ctx.translate(offset, offset);

  const rc: Ctx = { ctx, k, row, lp, opts, size, px, warnings };

  if (!tpl) {
    warnings.push(`el tipo «${row.tipo ?? ''}» no tiene plantilla`);
    drawMissingTemplate(rc);
    return { canvas, warnings };
  }

  for (const zone of tpl.zones) {
    if (zone.hidden || !conditionMatches(zone.showIf, row, opts.lang)) continue;
    ctx.save();
    try {
      if (zone.type === 'image') await drawImageZone(rc, zone);
      else if (zone.type === 'text') await drawTextZone(rc, zone);
      else if (zone.type === 'attributes') await drawAttributesZone(rc, zone);
      else if (zone.type === 'attribute') await drawAttributeZone(rc, zone);
      else if (zone.type === 'shape') drawShapeZone(rc, zone);
    } finally {
      ctx.restore();
    }
  }

  if (opts.focus?.length) drawFocus(rc, tpl.zones.filter((z) => opts.focus!.includes(z.id) && !z.hidden));
  if (opts.zones) drawZoneOutlines(rc, tpl.zones);
  if (opts.guides) drawGuides(rc);
  return { canvas, warnings };
}

// ---------------------------------------------------------------- geometría

/**
 * Rectángulo de la zona en píxeles. Con `bleed`, los bordes que tocan el corte se llevan
 * exactamente al borde del sangrado (aunque no se muestre, para que el encuadre no cambie).
 */
function zonePx(rc: Ctx, zone: Zone): Rect {
  const { k, px, size } = rc;
  const { x, y, w, h } = zone.rect;
  let L = x * k;
  let T = y * k;
  let R = (x + w) * k;
  let B = (y + h) * k;
  if (zone.bleed) {
    const e = 0.01;
    if (x <= e) L = -px.bleed;
    if (y <= e) T = -px.bleed;
    if (x + w >= size.width - e) R = px.trimWidth + px.bleed;
    if (y + h >= size.height - e) B = px.trimHeight + px.bleed;
  }
  return { x: L, y: T, w: R - L, h: B - T };
}

function toPx(r: Rect, k: number): Rect {
  return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
}

function drawFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect, fit: ImageZone['fit']) {
  if (fit === 'stretch') {
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    return;
  }
  const iw = img.naturalWidth || r.w;
  const ih = img.naturalHeight || r.h;
  const s = fit === 'contain' ? Math.min(r.w / iw, r.h / ih) : Math.max(r.w / iw, r.h / ih);
  const w = iw * s;
  const h = ih * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.drawImage(img, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------- recursos

async function loadImage(rc: Ctx, path: string, what: string): Promise<HTMLImageElement | null> {
  const img = await rc.lp.assets.image(path);
  if (!img) rc.warnings.push(`no se encuentra la imagen «${path}» (${what})`);
  return img;
}

async function attributeIcon(rc: Ctx, key: string, override?: string): Promise<HTMLImageElement | null> {
  const def = rc.lp.project.attributes[key];
  if (!def && !override) {
    rc.warnings.push(`atributo desconocido «${key}»`);
    return null;
  }
  return loadImage(rc, override ?? def.icon, key);
}

// ---------------------------------------------------------------- colores

/**
 * Color de la celda `bind` o, si está vacía, `fixed`; nombres de la paleta resueltos.
 * Un color que el canvas no entiende se avisa en vez de pintar con el anterior.
 */
function colorFor(rc: Ctx, bind: string | undefined, fixed: string | undefined, what: string): string {
  const cell = bind ? getField(rc.row, bind, rc.opts.lang) : '';
  const color = pickColor(cell, fixed, rc.lp.project.colors);
  if (!color) return '';
  const probe = '#010203';
  rc.ctx.fillStyle = probe;
  rc.ctx.fillStyle = color;
  if (rc.ctx.fillStyle === probe && color.toLowerCase() !== probe) {
    rc.warnings.push(`color no válido «${color}» (${what})`);
    return '';
  }
  return color;
}

/** Fuente con los nombres de la paleta resueltos y, si hay `colorBind`, el color de la carta. */
function fontFor(rc: Ctx, f: FontSpec, what: string, colorBind?: string): FontSpec {
  const palette = rc.lp.project.colors;
  const color = colorBind ? colorFor(rc, colorBind, f.color, what) : resolveColor(f.color, palette);
  return { ...f, color: color || f.color, strokeColor: resolveColor(f.strokeColor, palette) || undefined };
}

// ---------------------------------------------------------------- fuentes

function cssFamily(family: string): string {
  return /[,'"]/.test(family) || !/\s/.test(family) ? family : `"${family}"`;
}

function fontString(f: FontSpec, sizePx: number, bold = false, italic = false): string {
  const style = italic || f.style === 'italic' ? 'italic' : 'normal';
  const weight = bold ? 'bold' : String(f.weight ?? 'normal');
  return `${style} ${weight} ${sizePx}px ${cssFamily(f.family)}`;
}

function paintText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, f: FontSpec, k: number) {
  if (f.strokeColor && f.strokeWidth) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = f.strokeColor;
    ctx.lineWidth = f.strokeWidth * k * 2; // el trazo se centra en el contorno: la mitad queda fuera
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = f.color ?? '#000';
  ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------- zona imagen

async function drawImageZone(rc: Ctx, zone: ImageZone) {
  const value = zone.bind ? getField(rc.row, zone.bind, rc.opts.lang) : '';
  if (value === '-') return;
  const path = value || zone.default;
  if (!path) return;
  const img = await loadImage(rc, path, zone.id);
  if (!img) return;
  const fit = zone.fit ?? 'cover';
  const crop = zone.cropBind && fit === 'cover' ? getField(rc.row, zone.cropBind, rc.opts.lang) : '';
  if (!crop) return drawFit(rc.ctx, img, zonePx(rc, zone), fit);
  const r = zonePx(rc, zone);
  const d = coverRect(img.naturalWidth || r.w, img.naturalHeight || r.h, r, parseCrop(crop));
  rc.ctx.save();
  rc.ctx.beginPath();
  rc.ctx.rect(r.x, r.y, r.w, r.h);
  rc.ctx.clip();
  rc.ctx.drawImage(img, d.x, d.y, d.w, d.h);
  rc.ctx.restore();
}

// ---------------------------------------------------------------- zona texto

/** Marcado: **negrita**, *cursiva*, {atributo} como icono, salto de línea real, "\n" o <br>. */
type Tok = { t: 'w'; s: string; b: boolean; i: boolean } | { t: 'icon'; key: string } | { t: 'sp' } | { t: 'nl' };

export function tokenize(text: string): Tok[] {
  text = text.replace(/\r\n?/g, '\n').replace(/\\n|<br\s*\/?>/gi, '\n');
  const out: Tok[] = [];
  let bold = false;
  let italic = false;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'w', s: buf, b: bold, i: italic });
    buf = '';
  };
  for (let p = 0; p < text.length; p++) {
    const c = text[p];
    if (c === '*') {
      flush();
      if (text[p + 1] === '*') {
        bold = !bold;
        p++;
      } else italic = !italic;
    } else if (c === '{' && text.indexOf('}', p) > p) {
      flush();
      const end = text.indexOf('}', p);
      out.push({ t: 'icon', key: normalizeKey(text.slice(p + 1, end)) });
      p = end;
    } else if (c === '\n') {
      flush();
      out.push({ t: 'nl' });
    } else if (c === ' ' || c === '\t') {
      flush();
      if (out.at(-1)?.t !== 'sp') out.push({ t: 'sp' });
    } else buf += c;
  }
  flush();
  return out;
}

/** Una palabra es una secuencia de trozos sin espacios ("+1{fuerza}." no se parte). */
interface Piece {
  tok: Tok;
  w: number;
}
interface Word {
  pieces: Piece[];
  w: number;
}
interface Line {
  words: Word[];
  w: number;
  /** Última línea del párrafo (no se justifica). */
  last: boolean;
}

const ICON_EM = 1.15;

function iconBox(img: HTMLImageElement | null | undefined, sizePx: number) {
  const h = sizePx * ICON_EM;
  const ratio = img?.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
  return { w: h * ratio, h };
}

function layoutText(
  ctx: CanvasRenderingContext2D,
  tokens: Tok[],
  f: FontSpec,
  sizePx: number,
  maxW: number,
  icons: Map<string, HTMLImageElement | null>,
): { lines: Line[]; space: number } {
  const paragraphs: Word[][] = [[]];
  let word: Word | null = null;
  for (const tok of tokens) {
    if (tok.t === 'sp') {
      word = null;
      continue;
    }
    if (tok.t === 'nl') {
      paragraphs.push([]);
      word = null;
      continue;
    }
    if (!word) {
      word = { pieces: [], w: 0 };
      paragraphs[paragraphs.length - 1].push(word);
    }
    let w: number;
    if (tok.t === 'w') {
      ctx.font = fontString(f, sizePx, tok.b, tok.i);
      w = ctx.measureText(tok.s).width;
    } else w = iconBox(icons.get(tok.key), sizePx).w;
    word.pieces.push({ tok, w });
    word.w += w;
  }

  ctx.font = fontString(f, sizePx);
  const space = ctx.measureText(' ').width;
  const lines: Line[] = [];
  for (const para of paragraphs) {
    let line: Line = { words: [], w: 0, last: false };
    for (const wd of para) {
      const add = line.words.length ? space + wd.w : wd.w;
      if (line.words.length && line.w + add > maxW) {
        lines.push(line);
        line = { words: [wd], w: wd.w, last: false };
      } else {
        line.words.push(wd);
        line.w += add;
      }
    }
    line.last = true;
    lines.push(line);
  }
  return { lines, space };
}

async function drawTextZone(rc: Ctx, zone: TextZone) {
  const text = getField(rc.row, zone.bind, rc.opts.lang) || zone.default || '';
  if (!text) return;
  const { ctx, k } = rc;
  const f = fontFor(rc, zone.font, zone.id, zone.colorBind);

  const tokens = tokenize(text);
  const icons = new Map<string, HTMLImageElement | null>();
  for (const tok of tokens) {
    if (tok.t === 'icon' && !icons.has(tok.key)) icons.set(tok.key, await attributeIcon(rc, tok.key));
  }

  const r = zonePx(rc, zone);
  const pad = (zone.padding ?? 0) * k;
  const box = { x: r.x + pad, y: r.y + pad, w: r.w - 2 * pad, h: r.h - 2 * pad };
  const lh = zone.lineHeight ?? 1.2;
  const minPt = Math.min(zone.minSize ?? f.size, f.size);

  // Reducción automática: se baja de 0,25 en 0,25 pt hasta que cabe o se llega al mínimo.
  let pt = f.size;
  let sizePx: number;
  let lay: ReturnType<typeof layoutText>;
  for (;;) {
    sizePx = ptToMm(pt) * k;
    lay = layoutText(ctx, tokens, f, sizePx, box.w, icons);
    const fits = lay.lines.length * sizePx * lh <= box.h + 0.5 && lay.lines.every((l) => l.w <= box.w + 0.5);
    if (fits) break;
    if (pt <= minPt) {
      rc.warnings.push(`el texto de «${zone.id}» no cabe`);
      break;
    }
    pt = Math.max(minPt, pt - 0.25);
  }

  const lineH = sizePx * lh;
  const total = lay.lines.length * lineH;
  let y = zone.valign === 'middle' ? box.y + (box.h - total) / 2 : zone.valign === 'bottom' ? box.y + box.h - total : box.y;
  const align = zone.align ?? 'left';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  for (const line of lay.lines) {
    const justify = align === 'justify' && !line.last && line.words.length > 1;
    const gap = justify ? lay.space + (box.w - line.w) / (line.words.length - 1) : lay.space;
    let x = align === 'center' ? box.x + (box.w - line.w) / 2 : align === 'right' ? box.x + box.w - line.w : box.x;
    const base = y + (lineH - sizePx) / 2 + sizePx * 0.8;

    line.words.forEach((word, wi) => {
      if (wi) x += gap;
      for (const p of word.pieces) {
        if (p.tok.t === 'w') {
          ctx.font = fontString(f, sizePx, p.tok.b, p.tok.i);
          paintText(ctx, p.tok.s, x, base, f, k);
        } else if (p.tok.t === 'icon') {
          const img = icons.get(p.tok.key);
          const bx = iconBox(img, sizePx);
          if (img) ctx.drawImage(img, x, base - sizePx * 0.35 - bx.h / 2, bx.w, bx.h);
        }
        x += p.w;
      }
    });
    y += lineH;
  }
}

// ---------------------------------------------------------------- zona atributos

async function drawAttributesZone(rc: Ctx, zone: AttributesZone) {
  let items = parseAttributes(getField(rc.row, zone.bind ?? 'atributos', rc.opts.lang));
  if (zone.keys) {
    const keys = zone.keys.map(normalizeKey);
    items = items.filter((it) => keys.includes(it.key));
  }
  if (!items.length) return;

  const { ctx, k } = rc;
  const r = zonePx(rc, zone);
  const icon = zone.iconSize * k;
  const gap = (zone.gap ?? 1) * k;
  const pos = zone.valuePosition ?? 'over';
  const column = (zone.direction ?? 'column') === 'column';
  const font = fontFor(rc, zone.font, zone.id);
  const sizePx = ptToMm(font.size) * k;

  const imgs = await Promise.all(items.map((it) => attributeIcon(rc, it.key, it.icon)));

  // Lo que se escribe junto a cada icono: su valor o, si se pide, su nombre.
  const texts = items.map((it) => it.value || (zone.labels ? (rc.lp.project.attributes[it.key]?.label ?? it.key) : ''));
  const backdrop = zone.backdrop ? colorFor(rc, undefined, zone.backdrop, zone.id) : '';
  // Con fondo, cada celda lleva un margen alrededor (y uno más tras el texto): cuenta al alinear.
  const pad = backdrop ? icon * 0.1 : 0;
  ctx.font = fontString(font, sizePx);
  const cells = texts.map((text) => {
    const tw = text ? ctx.measureText(text).width : 0;
    const extra = 2 * pad + (text ? pad : 0);
    if (pos === 'after') return { w: icon + (text ? gap * 0.5 + tw : 0) + extra, h: icon };
    if (pos === 'below') return { w: Math.max(icon, tw) + extra, h: icon + (text ? sizePx * 1.1 : 0) };
    return { w: icon + 2 * pad, h: icon };
  });

  const total = cells.reduce((s, c) => s + (column ? c.h : c.w), 0) + gap * (cells.length - 1);
  const avail = column ? r.h : r.w;
  let cursor = zone.align === 'center' ? (avail - total) / 2 : zone.align === 'end' ? avail - total : 0;
  const widest = Math.max(...cells.map((c) => c.w));

  ctx.textBaseline = 'middle';
  items.forEach((it, i) => {
    const cell = cells[i];
    const cx = column ? r.x + (r.w - (pos === 'after' ? widest : cell.w)) / 2 : r.x + cursor;
    const cy = column ? r.y + cursor : r.y + (r.h - cell.h) / 2;
    const ix = pos === 'below' ? cx + (cell.w - icon) / 2 : cx + pad;
    const iy = cy;

    if (backdrop) {
      // Una píldora que abarca icono y texto; por arriba y por abajo sobresale el margen.
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, zone.backdropOpacity ?? 1));
      ctx.fillStyle = backdrop;
      ctx.beginPath();
      ctx.roundRect(cx, cy - pad, cell.w, cell.h + 2 * pad, (Math.min(cell.w, cell.h) + 2 * pad) / 2);
      ctx.fill();
      ctx.restore();
    }

    const img = imgs[i];
    if (img) drawFit(ctx, img, { x: ix, y: iy, w: icon, h: icon }, 'contain');
    else {
      ctx.fillStyle = 'rgba(128,128,128,.6)';
      ctx.beginPath();
      ctx.arc(ix + icon / 2, iy + icon / 2, icon / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const text = texts[i];
    if (text) {
      ctx.font = fontString(font, sizePx);
      if (pos === 'over') {
        ctx.textAlign = 'center';
        paintText(ctx, text, ix + icon / 2, iy + icon / 2, font, k);
      } else if (pos === 'after') {
        ctx.textAlign = 'left';
        paintText(ctx, text, ix + icon + gap * 0.5, iy + icon / 2, font, k);
      } else {
        ctx.textAlign = 'center';
        paintText(ctx, text, cx + cell.w / 2, iy + icon + sizePx * 0.6, font, k);
      }
    }
    cursor += (column ? cell.h : cell.w) + gap;
  });
}

// ---------------------------------------------------------------- zona atributo fijo

async function drawAttributeZone(rc: Ctx, zone: AttributeZone) {
  const key = normalizeKey(zone.key ?? '');
  const item = parseAttributes(getField(rc.row, zone.bind ?? 'atributos', rc.opts.lang)).find((it) => it.key === key);
  if (!item && !zone.showIfMissing) return;

  const def = rc.lp.project.attributes[key];
  if (!def && !zone.icon && !item?.icon) rc.warnings.push(`atributo desconocido «${zone.key}» en la zona «${zone.id}»`);
  const path = item?.icon ?? zone.icon ?? def?.icon;
  const img = path ? await loadImage(rc, path, zone.id) : null;

  const { ctx, k } = rc;
  const r = zonePx(rc, zone);
  const pos = zone.valuePosition ?? 'over';
  const font = fontFor(rc, zone.font, zone.id);
  const sizePx = ptToMm(font.size) * k;

  // El icono ocupa la zona entera ("over"/"none"), su parte izquierda ("after") o su parte superior ("below").
  let icon: Rect = r;
  if (pos === 'after') {
    const side = Math.min(r.w, r.h);
    icon = { x: r.x, y: r.y + (r.h - side) / 2, w: side, h: side };
  } else if (pos === 'below') {
    const side = Math.max(0, Math.min(r.w, r.h - sizePx * 1.2));
    icon = { x: r.x + (r.w - side) / 2, y: r.y, w: side, h: side };
  }
  if (img) drawFit(ctx, img, icon, 'contain');

  const value = item?.value ?? '';
  if (!value || pos === 'none') return;
  ctx.font = fontString(font, sizePx);
  ctx.textBaseline = 'middle';
  if (pos === 'over') {
    ctx.textAlign = 'center';
    paintText(ctx, value, r.x + r.w / 2, r.y + r.h / 2, font, k);
  } else if (pos === 'after') {
    ctx.textAlign = 'left';
    paintText(ctx, value, icon.x + icon.w + sizePx * 0.25, r.y + r.h / 2, font, k);
  } else {
    ctx.textAlign = 'center';
    paintText(ctx, value, r.x + r.w / 2, icon.y + icon.h + (r.h - icon.h) / 2, font, k);
  }
}

// ---------------------------------------------------------------- zona forma

/** El borde se dibuja por dentro del rectángulo de la zona: la forma nunca se sale de él. */
function drawShapeZone(rc: Ctx, zone: ShapeZone) {
  const { ctx, k } = rc;
  const r = zonePx(rc, zone);
  const fill = colorFor(rc, zone.fillBind, zone.fill, zone.id);
  const stroke = colorFor(rc, zone.strokeBind, zone.stroke, zone.id);
  const sw = stroke ? Math.max(0, (zone.strokeWidth ?? 0) * k) : 0;
  if (!fill && !sw) return;

  const x = r.x + sw / 2;
  const y = r.y + sw / 2;
  const w = Math.max(0, r.w - sw);
  const h = Math.max(0, r.h - sw);
  ctx.globalAlpha = Math.min(1, Math.max(0, zone.opacity ?? 1));
  ctx.beginPath();
  if (zone.shape === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else ctx.roundRect(x, y, w, h, Math.min((zone.radius ?? 0) * k, w / 2, h / 2));
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (sw) {
    ctx.lineWidth = sw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- datos de ejemplo

const PLACEHOLDER_TEXT: Record<string, string> = {
  titulo: 'Título de la carta',
  descripcion:
    'Texto de reglas de ejemplo. Al atacar, gana **+1** de daño. Este párrafo sirve para ver cómo se reparte el texto dentro de la zona.',
  sabor: '«Un texto de ambientación de ejemplo.»',
};

/** Una fila inventada para ver una plantilla que todavía no tiene cartas en el CSV. */
export function placeholderRow(project: Project, tipo: string): CardRow {
  const row: CardRow = { id: 'EJEMPLO', tipo };
  const keys = new Set<string>();
  for (const z of project.templates[tipo]?.zones ?? []) {
    if (z.type === 'text' && !z.default) row[normalizeKey(z.bind)] = PLACEHOLDER_TEXT[normalizeKey(z.bind)] ?? `[${z.bind}]`;
    if (z.type === 'attribute') keys.add(normalizeKey(z.key));
    if (z.type === 'attributes') for (const key of z.keys ?? Object.keys(project.attributes).slice(0, 3)) keys.add(normalizeKey(key));
  }
  row.atributos = [...keys].map((key) => `${key}:9`).join(' | ');
  return row;
}

// ---------------------------------------------------------------- ayudas visuales

export const ZONE_COLORS: Record<ZoneType, string> = {
  image: '#00b3ff',
  text: '#ff9f1a',
  attributes: '#2ecc71',
  attribute: '#e056fd',
  shape: '#ff5c8a',
};

function drawZoneOutlines(rc: Ctx, zones: Zone[]) {
  const { ctx, k } = rc;
  ctx.save();
  ctx.lineWidth = Math.max(1, k * 0.2);
  ctx.font = `bold ${k * 2}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (const z of zones) {
    const r = toPx(z.rect, k);
    ctx.strokeStyle = ZONE_COLORS[z.type] ?? '#f0f';
    ctx.setLineDash([]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    const label = z.id;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(r.x, r.y, tw + k, k * 2.6);
    ctx.fillStyle = '#000';
    ctx.fillText(label, r.x + k * 0.5, r.y + k * 0.3);
  }
  ctx.restore();
}

/** Oscurece la carta salvo las zonas dadas y las recuadra. */
function drawFocus(rc: Ctx, zones: Zone[]) {
  if (!zones.length) return;
  const { ctx, k, px } = rc;
  const rects = zones.map((z) => zonePx(rc, z));
  // Si una zona es la carta entera (el fondo), no hay nada que oscurecer.
  if (rects.some((r) => r.w >= px.trimWidth && r.h >= px.trimHeight)) return;
  // Capa aparte con agujeros: las zonas que se solapan no se anulan entre sí.
  const layer = document.createElement('canvas');
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const lc = layer.getContext('2d')!;
  lc.setTransform(ctx.getTransform());
  lc.fillStyle = 'rgba(10, 12, 18, 0.55)';
  lc.fillRect(-px.bleed, -px.bleed, px.trimWidth + 2 * px.bleed, px.trimHeight + 2 * px.bleed);
  for (const r of rects) lc.clearRect(r.x, r.y, r.w, r.h);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.lineWidth = Math.max(2, k * 0.35);
  ctx.strokeStyle = '#4c7dff';
  for (const r of rects) ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

export const GUIDE_COLORS = {
  bleed: 'rgba(255, 0, 80, 0.3)',
  trim: 'rgba(255, 0, 80, 0.95)',
  danger: 'rgba(255, 170, 0, 0.25)',
  safe: 'rgba(0, 200, 255, 0.95)',
};

/** Sangrado (se recorta), línea de corte, zona peligrosa (corte → margen) y margen de seguridad. */
function drawGuides(rc: Ctx) {
  const { ctx, k, size, px } = rc;
  const W = px.trimWidth;
  const H = px.trimHeight;
  const B = px.bleed;
  const s = (size.safe ?? 0) * k;
  const band = (outer: Rect, inner: Rect, color: string) => {
    ctx.beginPath();
    ctx.rect(outer.x, outer.y, outer.w, outer.h);
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.fillStyle = color;
    ctx.fill('evenodd');
  };
  const trim = { x: 0, y: 0, w: W, h: H };
  const safe = { x: s, y: s, w: W - 2 * s, h: H - 2 * s };

  ctx.save();
  if (rc.opts.bleed) band({ x: -B, y: -B, w: W + 2 * B, h: H + 2 * B }, trim, GUIDE_COLORS.bleed);
  if (s > 0) band(trim, safe, GUIDE_COLORS.danger);
  ctx.lineWidth = Math.max(1, k * 0.12);
  ctx.strokeStyle = GUIDE_COLORS.trim;
  ctx.strokeRect(0, 0, W, H);
  if (s > 0) {
    ctx.setLineDash([k * 1.2, k * 0.8]);
    ctx.strokeStyle = GUIDE_COLORS.safe;
    ctx.strokeRect(safe.x, safe.y, safe.w, safe.h);
  }
  ctx.restore();
}

function drawMissingTemplate(rc: Ctx) {
  const { ctx, k, size } = rc;
  ctx.fillStyle = '#ddd';
  ctx.fillRect(0, 0, size.width * k, size.height * k);
  ctx.fillStyle = '#a00';
  ctx.font = `bold ${k * 4}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Sin plantilla', (size.width * k) / 2, (size.height * k) / 2 - k * 3);
  ctx.font = `${k * 3}px sans-serif`;
  ctx.fillText(`tipo: «${rc.row.tipo ?? ''}»`, (size.width * k) / 2, (size.height * k) / 2 + k * 3);
}
