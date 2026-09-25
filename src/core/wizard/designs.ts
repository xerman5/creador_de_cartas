import type { AttributeZone, AttributesZone, CardSize, FontSpec, ImageZone, Rect, ShapeZone, TextZone, Zone } from '../types';
import { FONT_PAIRS, fileKey, type Adjust, type DesignId, type ElementKey } from './answers';

export interface LayoutInput {
  design: DesignId;
  elements: Set<ElementKey>;
  size: CardSize;
  adjust: Adjust;
  /** Clave del tipo: nombre de su ilustración provisional. */
  tipo: string;
  /** Atributos con número (sin el coste). */
  statKeys: string[];
  /** Habilidades: atributos de solo icono, en su propia fila. */
  abilityKeys?: string[];
  /** Columna del CSV con la rareza o facción. */
  variantColumn: string;
}

/** Ruta (dentro de assets/) de la ilustración provisional de un tipo. */
export const artPath = (tipo: string) => `provisional/ilustracion-${fileKey(tipo)}.svg`;

const r2 = (v: number) => Math.round(v * 100) / 100;
const box = (x: number, y: number, w: number, h: number): Rect => ({ x: r2(x), y: r2(y), w: r2(Math.max(0.5, w)), h: r2(Math.max(0.5, h)) });

/**
 * Crea las zonas de una plantilla. Las medidas se escalan con el tamaño de la carta (f = 1 en póker)
 * y todo el contenido queda dentro del margen de seguridad; imágenes y formas pueden llegar al sangrado.
 */
export function layoutZones(inp: LayoutInput): Zone[] {
  const L = new Layout(inp);
  switch (inp.design) {
    case 'completa':
      L.completa();
      break;
    case 'retrato':
      L.retrato();
      break;
    case 'texto':
      L.texto();
      break;
    default:
      L.clasico();
  }
  return L.zones;
}

class Layout {
  zones: Zone[] = [];
  readonly W: number;
  readonly H: number;
  /** Escala respecto a una carta de póker. */
  readonly f: number;
  readonly g: number;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly iw: number;
  readonly radius: number;
  readonly has: (e: ElementKey) => boolean;
  /** Hay habilidades (solo icono) que dibujar. */
  readonly hasAb: boolean;
  /** Alto de la fila de habilidades. */
  readonly abH: number;
  readonly titleFont: string;
  readonly bodyFont: string;

  constructor(private inp: LayoutInput) {
    const { width: W, height: H } = inp.size;
    this.W = W;
    this.H = H;
    this.f = Math.min(W / 63, H / 88);
    this.g = 1.2 * this.f;
    const m = (inp.size.safe ?? 3) + 0.5;
    this.x0 = m;
    this.x1 = W - m;
    this.y0 = m;
    this.y1 = H - m;
    this.iw = this.x1 - this.x0;
    this.radius = inp.adjust.rounded ? 1.8 * this.f : 0;
    // «stats» es la lista de números; las habilidades van aparte.
    this.has = (e) => (e === 'stats' ? inp.elements.has('stats') && inp.statKeys.length > 0 : inp.elements.has(e));
    this.hasAb = inp.elements.has('stats') && (inp.abilityKeys?.length ?? 0) > 0;
    this.abH = 6.5 * this.f;
    const pair = FONT_PAIRS[inp.adjust.fonts] ?? FONT_PAIRS.clasica;
    this.titleFont = pair.title;
    this.bodyFont = pair.body;
  }

  // ------------------------------------------------------------ piezas

  private font(role: 'title' | 'body', pt: number, color: string, extra: Partial<FontSpec> = {}): FontSpec {
    return { family: role === 'title' ? this.titleFont : this.bodyFont, size: r2(pt * this.f), color, ...extra };
  }

  private shape(id: string, r: Rect, fill: string | undefined, extra: Partial<ShapeZone> = {}) {
    this.zones.push({ id, type: 'shape', shape: 'rect', fill, radius: r2(this.radius), rect: r, ...extra } as ShapeZone);
  }

  private background(fill: string) {
    this.shape('fondo', box(0, 0, this.W, this.H), fill, { bleed: true, radius: 0, locked: true });
  }

  private art(r: Rect, bleed = false) {
    const z: ImageZone = { id: 'ilustracion', type: 'image', bind: 'ilustracion', default: artPath(this.inp.tipo), fit: 'cover', rect: r };
    if (bleed) z.bleed = true;
    this.zones.push(z);
    if (!bleed) this.shape('marco ilustracion', r, undefined, { stroke: 'acento', strokeWidth: r2(0.35 * this.f) });
  }

  private title(r: Rect, color: string, pt = 10.5, align: TextZone['align'] = 'center') {
    this.zones.push({
      id: 'titulo',
      type: 'text',
      bind: 'titulo',
      align,
      valign: 'middle',
      minSize: r2(6 * this.f),
      font: this.font('title', pt, color, { weight: 'bold' }),
      rect: r,
    });
  }

  private subtitle(r: Rect, color: string, align: TextZone['align'] = 'center') {
    this.zones.push({
      id: 'linea de tipo',
      type: 'text',
      bind: 'subtipo',
      align,
      valign: 'middle',
      padding: r2(0.8 * this.f),
      minSize: r2(4.5 * this.f),
      font: this.font('body', 6.5, color, { weight: 'bold' }),
      rect: r,
    });
  }

  private rules(r: Rect, color: string, pt = 7.5, align: TextZone['align'] = 'center') {
    this.zones.push({
      id: 'reglas',
      type: 'text',
      bind: 'descripcion',
      align,
      valign: 'middle',
      padding: r2(1.8 * this.f),
      minSize: r2(5 * this.f),
      lineHeight: 1.2,
      font: this.font('body', pt, color),
      rect: r,
    });
  }

  private flavor(r: Rect, color: string, pt = 6.5) {
    this.zones.push({
      id: 'ambientacion',
      type: 'text',
      bind: 'sabor',
      align: 'center',
      valign: 'middle',
      padding: r2(0.8 * this.f),
      minSize: r2(4.5 * this.f),
      font: this.font('body', pt, color, { style: 'italic' }),
      rect: r,
    });
  }

  private number(r: Rect, color: string) {
    this.zones.push({
      id: 'numero',
      type: 'text',
      bind: 'numero',
      align: 'right',
      valign: 'middle',
      font: this.font('body', 4.5, color),
      rect: r,
    });
  }

  private valueFont(iconMm: number): FontSpec {
    return {
      family: this.titleFont,
      size: r2(Math.max(5, iconMm * 1.25)),
      weight: 'bold',
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: r2(0.35 * this.f),
    };
  }

  private cost(x: number, y: number, d: number) {
    const z: AttributeZone = { id: 'coste', type: 'attribute', key: 'coste', valuePosition: 'over', font: this.valueFont(d), rect: box(x, y, d, d) };
    this.zones.push(z);
  }

  private gem(x: number, y: number, d: number) {
    this.zones.push({
      id: 'marca',
      type: 'shape',
      shape: 'ellipse',
      fillBind: this.inp.variantColumn,
      showIf: this.inp.variantColumn,
      stroke: 'tinta',
      strokeWidth: r2(0.3 * this.f),
      rect: box(x, y, d, d),
    });
  }

  /** Lista de atributos en columna o en fila, con el icono tan grande como quepa. */
  private stats(r: Rect, direction: 'column' | 'row') {
    const n = Math.max(1, this.inp.statKeys.length);
    const gap = r2(0.8 * this.f);
    const along = direction === 'column' ? r.h : r.w;
    const across = direction === 'column' ? r.w : r.h;
    const icon = r2(Math.max(2, Math.min(across - 1.6 * this.f, 9 * this.f, (along - 1.6 * this.f - gap * (n - 1)) / n)));
    const z: AttributesZone = {
      id: 'atributos',
      type: 'attributes',
      bind: 'atributos',
      keys: [...this.inp.statKeys],
      direction,
      align: 'center',
      gap,
      iconSize: icon,
      valuePosition: 'over',
      font: this.valueFont(icon),
      rect: r,
    };
    this.zones.push(z);
  }

  /** Fila de habilidades: solo iconos (con su valor al lado si la carta lo tiene). */
  private abilities(r: Rect, align: AttributesZone['align']) {
    const keys = this.inp.abilityKeys ?? [];
    const n = Math.max(1, keys.length);
    const gap = r2(0.8 * this.f);
    // El fondo de cada icono sobresale un 10 %: se deja sitio para él.
    const icon = r2(Math.max(2, Math.min((r.h - 0.4 * this.f) / 1.2, 5.5 * this.f, (r.w - gap * (n - 1)) / (n * 1.2))));
    this.zones.push({
      id: 'habilidades',
      type: 'attributes',
      bind: 'atributos',
      keys: [...keys],
      direction: 'row',
      align,
      gap,
      iconSize: icon,
      valuePosition: 'after',
      // Sobre el fondo claro de cada icono, el texto (nombre o valor) va en tinta.
      font: { family: this.titleFont, size: r2(Math.max(5, icon * 1.1)), weight: 'bold', color: 'tinta' },
      backdrop: 'papel',
      backdropOpacity: 0.85,
      rect: r,
    });
  }

  /** Habilidades sobre el borde inferior de la ilustración, entre `xa` y `xb`. */
  private abilitiesOnArt(art: Rect, xa: number, xb: number, align: AttributesZone['align'], bottom = art.y + art.h - this.f) {
    const h = Math.min(this.abH, bottom - art.y - this.f);
    this.abilities(box(xa, bottom - h, xb - xa, h), align);
  }

  /** ¿Caben los atributos en una columna de esta altura con iconos legibles? */
  private columnFits(h: number): boolean {
    const n = Math.max(1, this.inp.statKeys.length);
    return (h - 1.6 * this.f - 0.8 * this.f * (n - 1)) / n >= 5 * this.f;
  }

  /** Alto mínimo para que reglas y ambientación sigan siendo legibles. */
  private minTextH(): number {
    return (this.has('rules') ? 15 * this.f : 0) + (this.has('flavor') ? (this.has('rules') ? 6 : 9) * this.f : 0);
  }

  /** Reparte `avail` entre ilustración y texto respetando el mínimo del texto. */
  private split(avail: number, share: number, hasText: boolean): { artH: number; textH: number } {
    if (this.has('art') && hasText) {
      const artH = Math.max(0, Math.min(avail * share, avail - this.g - this.minTextH()));
      return { artH, textH: avail - artH - this.g };
    }
    if (this.has('art')) return { artH: avail, textH: 0 };
    return { artH: 0, textH: hasText ? avail : 0 };
  }

  /** Coste y marca en una banda horizontal; devuelve el hueco que queda para el texto. */
  private corners(y: number, h: number, x0 = this.x0, x1 = this.x1): { l: number; r: number } {
    const { f } = this;
    const cs = Math.min(h - 0.6 * f, 6.8 * f);
    const gd = Math.min(h - 2 * f, 3.6 * f);
    let l = x0 + 1.5 * f;
    let r = x1 - 1.5 * f;
    const costLeft = this.inp.adjust.costCorner === 'left';
    if (this.has('cost')) {
      const cx = costLeft ? x0 + 0.9 * f : x1 - 0.9 * f - cs;
      this.cost(cx, y + (h - cs) / 2, cs);
      if (costLeft) l = cx + cs + f;
      else r = cx - f;
    }
    if (this.has('variant')) {
      const gemLeft = this.has('cost') && !costLeft;
      const gx = gemLeft ? x0 + 1.4 * f : x1 - 1.4 * f - gd;
      this.gem(gx, y + (h - gd) / 2, gd);
      if (gemLeft) l = gx + gd + f;
      else r = gx - f;
    }
    return { l, r };
  }

  /** Caja de papel con reglas y, debajo, ambientación. */
  private textBox(x: number, y: number, w: number, h: number, fill: string | undefined, ink: string, flavorInk: string, rulesPt = 7.5) {
    if (fill) this.shape('caja de texto', box(x, y, w, h), fill);
    const { f } = this;
    if (this.has('rules') && this.has('flavor')) {
      const fh = Math.min(8 * f, h * 0.3);
      this.rules(box(x, y, w, h - fh), ink, rulesPt);
      this.flavor(box(x + 1.5 * f, y + h - fh, w - 3 * f, fh), flavorInk);
    } else if (this.has('rules')) this.rules(box(x, y, w, h), ink, rulesPt);
    else if (this.has('flavor')) this.flavor(box(x + 1.5 * f, y, w - 3 * f, h), flavorInk, 7);
  }

  // ------------------------------------------------------------ diseños

  clasico() {
    const { f, g, x0, x1, iw, y0, y1 } = this;
    const a = this.inp.adjust;
    this.background('principal');

    let y = y0;
    const hH = 8.5 * f;
    this.shape('cabecera', box(x0, y, iw, hH), 'papel');
    const t = this.corners(y, hH);
    this.title(box(t.l, y, t.r - t.l, hH), 'tinta');
    y += hH + g;

    let yb = y1;
    if (this.has('number')) {
      this.number(box(x0, yb - 2.6 * f, iw, 2.6 * f), 'papel');
      yb -= 3.2 * f;
    }
    const hasText = this.has('rules') || this.has('flavor');
    const subH = 5.2 * f;
    const rowH = 9 * f;
    // Sin ilustración, las habilidades van en su propia fila.
    const abRow = this.hasAb && !this.has('art');
    const availFor = (row: boolean) => yb - y - (this.has('subtitle') ? subH + g : 0) - (row ? rowH + g : 0) - (abRow ? this.abH + g : 0);

    let side = this.has('stats') && this.has('art') && a.attrSide !== 'bottom';
    let { artH, textH } = this.split(availFor(!side && this.has('stats')), a.art, hasText);
    // Si la ilustración queda corta para la columna, los atributos pasan a una fila.
    if (side && !this.columnFits(artH - 2.4 * f)) {
      side = false;
      ({ artH, textH } = this.split(availFor(true), a.art, hasText));
    }
    const row = this.has('stats') && !side;

    if (this.has('art')) {
      const artBox = box(x0, y, iw, artH);
      this.art(artBox);
      const cw = 11.5 * f;
      const cx = a.attrSide === 'left' ? x0 + 1.2 * f : x1 - 1.2 * f - cw;
      if (side) {
        const col = box(cx, y + 1.2 * f, cw, artH - 2.4 * f);
        this.shape('fondo atributos', col, 'tinta', { opacity: 0.55 });
        this.stats(col, 'column');
      }
      if (this.hasAb) {
        if (side && a.attrSide === 'left') this.abilitiesOnArt(artBox, cx + cw + f, x1 - 1.2 * f, 'end');
        else if (side) this.abilitiesOnArt(artBox, x0 + 1.2 * f, cx - f, 'start');
        else this.abilitiesOnArt(artBox, x0 + 1.2 * f, x1 - 1.2 * f, 'end');
      }
      y += artH + g;
    }
    if (this.has('subtitle')) {
      this.shape('banda tipo', box(x0, y, iw, subH), 'papel');
      this.subtitle(box(x0 + f, y, iw - 2 * f, subH), 'tinta');
      y += subH + g;
    }
    if (abRow) {
      this.abilities(box(x0, y, iw, this.abH), 'center');
      y += this.abH + g;
    }
    if (row) {
      const r = box(x0, y, iw, rowH);
      this.shape('fondo atributos', r, 'tinta', { opacity: 0.8 });
      this.stats(r, 'row');
      y += rowH + g;
    }
    if (hasText) this.textBox(x0, y, iw, textH, 'papel', 'tinta', 'tinta');
  }

  completa() {
    const { f, g, x0, x1, iw, y0, y1 } = this;
    const a = this.inp.adjust;
    if (this.has('art')) this.art(box(0, 0, this.W, this.H), true);
    else this.background('principal');

    const hH = 8.5 * f;
    this.shape('cabecera', box(x0, y0, iw, hH), 'tinta', { opacity: 0.72 });
    const t = this.corners(y0, hH);
    this.title(box(t.l, y0, t.r - t.l, hH), 'papel');
    const top = y0 + hH + g;

    const hasText = this.has('rules') || this.has('flavor');
    const subH = 5 * f;
    const rowH = 8.5 * f;
    const numH = this.has('number') ? 3 * f : 0;
    const innerH = y1 - top;
    let side = this.has('stats') && a.attrSide !== 'bottom';
    const minPanel = (this.has('subtitle') ? subH + g : 0) + (hasText ? 16 * f : 0) + numH + 2 * f;
    let panelH = hasText || this.has('subtitle') || this.has('number') ? Math.max(minPanel, innerH * (1 - a.art)) : 0;
    panelH = Math.min(panelH, innerH * 0.75);
    // Las habilidades van en la ilustración, justo encima del panel: que quepan.
    if (this.hasAb) panelH = Math.max(Math.min(panelH, innerH - this.abH - 3 * g), Math.min(minPanel, panelH));
    // Sin sitio para la columna: los atributos pasan a una fila dentro del panel.
    if (side && innerH - panelH - 2 * g < 14 * f) side = false;
    const row = this.has('stats') && !side;
    if (row) panelH = Math.min(innerH * 0.85, panelH + rowH + g);
    if (!panelH && row) panelH = rowH + 2 * f;

    const pTop = y1 - panelH;
    if (panelH) this.shape('panel', box(x0, pTop, iw, panelH), 'tinta', { opacity: 0.78 });
    const cw = 11.5 * f;
    const cx = a.attrSide === 'left' ? x0 : x1 - cw;
    if (side) {
      const col = box(cx, top, cw, pTop - g - top);
      this.shape('fondo atributos', col, 'tinta', { opacity: 0.55 });
      this.stats(col, 'column');
    }
    if (this.hasAb) {
      const free = box(x0, top, iw, pTop - g - top);
      const bottom = pTop - g;
      if (side && a.attrSide === 'left') this.abilitiesOnArt(free, cx + cw + f, x1 - f, 'end', bottom);
      else if (side) this.abilitiesOnArt(free, x0 + f, cx - f, 'start', bottom);
      else this.abilitiesOnArt(free, x0 + f, x1 - f, 'end', bottom);
    }

    let y = pTop + f;
    if (this.has('subtitle')) {
      this.subtitle(box(x0 + f, y, iw - 2 * f, subH), 'acento');
      y += subH + 0.4 * f;
    }
    if (row) {
      this.stats(box(x0 + f, y, iw - 2 * f, rowH), 'row');
      y += rowH + g * 0.5;
    }
    const yEnd = y1 - numH - 0.6 * f;
    if (hasText) this.textBox(x0, y, iw, yEnd - y, undefined, 'papel', 'acento');
    if (this.has('number')) this.number(box(x0 + f, y1 - numH, iw - 2 * f, numH - 0.4 * f), 'papel');
  }

  retrato() {
    const { f, g, x0, x1, iw, y0, y1 } = this;
    const a = this.inp.adjust;
    this.background('principal');

    const cw = 12.5 * f;
    // La columna acompaña a la ilustración; sin ella, los atributos van en fila.
    const side = this.has('stats') && this.has('art') && a.attrSide !== 'bottom' ? a.attrSide : null;
    const cx0 = side === 'left' ? x0 + cw + g : x0;
    const cx1 = side === 'right' ? x1 - cw - g : x1;
    const plateH = 8.5 * f;
    const subH = 5 * f;
    const rowH = 9 * f;
    const row = this.has('stats') && !side;
    const hasText = this.has('rules') || this.has('flavor');
    const abRow = this.hasAb && !this.has('art');

    let yb = y1;
    if (this.has('number')) {
      this.number(box(x0, yb - 2.6 * f, iw, 2.6 * f), 'papel');
      yb -= 3.2 * f;
    }
    const fixed = plateH + g + (this.has('subtitle') ? subH + g : 0) + (row ? rowH + g : 0) + (abRow ? this.abH + g : 0);
    const avail = yb - y0 - fixed;
    const { artH } = this.split(avail + g, a.art, hasText);

    let y = y0;
    if (this.has('art')) {
      // El coste y la marca van sobre las esquinas superiores de la ilustración.
      this.art(box(cx0, y, cx1 - cx0, artH));
      const cs = 6.8 * f;
      const gd = 3.6 * f;
      const costLeft = a.costCorner === 'left';
      if (this.has('cost')) this.cost(costLeft ? cx0 + 0.9 * f : cx1 - 0.9 * f - cs, y + 0.9 * f, cs);
      const gemLeft = this.has('cost') && !costLeft;
      if (this.has('variant')) this.gem(gemLeft ? cx0 + 1.4 * f : cx1 - 1.4 * f - gd, y + 1.4 * f, gd);
      if (this.hasAb) {
        // Encima de la placa; si llegan a la altura del coste y la marca, se apartan de esas esquinas.
        const bottom = y + artH - plateH * 0.45 - 0.8 * f;
        const low = bottom - this.abH > y + 0.9 * f + cs + 0.3 * f;
        let xa = cx0 + f;
        let xb = cx1 - f;
        if (!low) {
          const leftUsed = (this.has('cost') && costLeft) || (this.has('variant') && gemLeft);
          const rightUsed = (this.has('cost') && !costLeft) || (this.has('variant') && !gemLeft);
          if (leftUsed) xa = cx0 + 0.9 * f + cs + f;
          if (rightUsed) xb = cx1 - 0.9 * f - cs - f;
        }
        this.abilitiesOnArt(box(cx0, y, cx1 - cx0, artH), xa, xb, 'center', bottom);
      }
      y += artH - plateH * 0.45;
      this.shape('placa', box(cx0 + f, y, cx1 - cx0 - 2 * f, plateH), 'papel', { stroke: 'acento', strokeWidth: r2(0.4 * f) });
      this.title(box(cx0 + 2 * f, y, cx1 - cx0 - 4 * f, plateH), 'tinta');
    } else {
      this.shape('placa', box(cx0, y, cx1 - cx0, plateH), 'papel', { stroke: 'acento', strokeWidth: r2(0.4 * f) });
      const t = this.corners(y, plateH, cx0, cx1);
      this.title(box(t.l, y, t.r - t.l, plateH), 'tinta');
    }
    y += plateH + g;
    if (side) {
      const col = box(side === 'left' ? x0 : x1 - cw, y0, cw, y - g - y0);
      this.shape('fondo atributos', col, 'tinta', { opacity: 0.45 });
      this.stats(col, 'column');
    }
    if (this.has('subtitle')) {
      this.subtitle(box(x0, y, iw, subH), 'papel', 'center');
      y += subH + g;
    }
    if (abRow) {
      this.abilities(box(x0, y, iw, this.abH), 'center');
      y += this.abH + g;
    }
    if (row) {
      const r = box(x0, y, iw, rowH);
      this.shape('fondo atributos', r, 'tinta', { opacity: 0.45 });
      this.stats(r, 'row');
      y += rowH + g;
    }
    if (hasText) this.textBox(x0, y, iw, yb - y, 'papel', 'tinta', 'tinta');
  }

  texto() {
    const { f, g, x0, x1, y0, y1 } = this;
    const a = this.inp.adjust;
    this.background('papel');
    this.shape('marco', box(x0, y0, x1 - x0, y1 - y0), undefined, { stroke: 'principal', strokeWidth: r2(1.1 * f) });

    const ix0 = x0 + 2.5 * f;
    const ix1 = x1 - 2.5 * f;
    const iw = ix1 - ix0;
    let y = y0 + 2 * f;
    let yb = y1 - 2 * f;

    if (this.has('cost') || this.has('variant') || this.has('subtitle')) {
      const h = 6.8 * f;
      const t = this.corners(y, h, ix0 - 1.5 * f, ix1 + 1.5 * f);
      if (this.has('subtitle')) this.subtitle(box(t.l, y, t.r - t.l, h), 'principal', 'center');
      y += h + g;
    }
    const titleH = 13 * f;
    this.title(box(ix0, y, iw, titleH), 'principal', 13);
    y += titleH + g;

    if (this.has('number')) {
      this.number(box(ix0, yb - 2.6 * f, iw, 2.6 * f), 'principal');
      yb -= 3.2 * f;
    }
    if (this.has('stats')) {
      const rowH = 9 * f;
      const r = box(ix0, yb - rowH, iw, rowH);
      this.shape('fondo atributos', r, 'principal', { opacity: 0.9 });
      this.stats(r, 'row');
      yb -= rowH + g;
    }
    if (this.hasAb && !this.has('art')) {
      this.abilities(box(ix0, yb - this.abH, iw, this.abH), 'center');
      yb -= this.abH + g;
    }
    if (this.has('flavor')) {
      const fh = 9 * f;
      this.flavor(box(ix0, yb - fh, iw, fh), 'principal', 7);
      yb -= fh + g * 0.5;
    }
    if (this.has('art')) {
      // En este diseño manda el texto: la ilustración es secundaria salvo que no haya reglas.
      const free = yb - y;
      const artH = this.has('rules') ? Math.max(13 * f, Math.min(free * a.art * 0.7, free - g - 15 * f)) : free;
      const artBox = box(ix0, y, iw, artH);
      this.art(artBox);
      if (this.hasAb) this.abilitiesOnArt(artBox, ix0 + f, ix1 - f, 'end');
      y += artH + g;
    }
    if (this.has('rules')) {
      this.zones.push({
        id: 'reglas',
        type: 'text',
        bind: 'descripcion',
        align: 'center',
        valign: 'middle',
        padding: r2(0.8 * f),
        minSize: r2(6 * f),
        lineHeight: 1.25,
        font: this.font('body', 10, 'tinta'),
        rect: box(ix0, y, iw, yb - y),
      });
    }
  }
}
