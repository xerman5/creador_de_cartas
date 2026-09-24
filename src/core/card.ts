import type { CardSize, Project, Rect, Template } from './types';

/** Sangrado por lado. Es fijo: toda carta se diseña y se exporta con él. */
export const BLEED_MM = 3;
export const DEFAULT_SAFE_MM = 3;

export function cardSizeFor(project: Project, tpl?: Template): CardSize {
  return { ...project.card, ...tpl?.size };
}

export interface CardPixels {
  /** Tamaño del corte. */
  trimWidth: number;
  trimHeight: number;
  /** Sangrado por lado. */
  bleed: number;
  /** Tamaño total, con sangrado. */
  width: number;
  height: number;
}

/**
 * Cada medida se redondea por separado: el corte cae en un píxel entero y el sangrado
 * es idéntico en los cuatro lados. total = round(mm·ppp/25,4) + 2·round(3·ppp/25,4).
 */
export function cardPixels(size: CardSize, dpi: number): CardPixels {
  const k = dpi / 25.4;
  const bleed = Math.round(BLEED_MM * k);
  const trimWidth = Math.round(size.width * k);
  const trimHeight = Math.round(size.height * k);
  return { trimWidth, trimHeight, bleed, width: trimWidth + 2 * bleed, height: trimHeight + 2 * bleed };
}

export interface SafeAreaIssue {
  index: number;
  zone: string;
  message: string;
}

const fmt = (mm: number) => mm.toLocaleString('es', { maximumFractionDigits: 1 });

/**
 * Zonas de contenido (textos y atributos) que entran en la zona peligrosa, la franja
 * entre el corte y el margen de seguridad donde la cuchilla puede desviarse.
 * Las imágenes no cuentan: fondos y marcos suelen llegar al borde a propósito.
 */
export function safeAreaIssues(tpl: Template, size: CardSize): SafeAreaIssue[] {
  const s = size.safe ?? 0;
  const issues: SafeAreaIssue[] = [];
  tpl.zones.forEach((z, index) => {
    if (z.hidden || z.type === 'image') return;
    const pad = z.type === 'text' ? (z.padding ?? 0) : 0;
    const r: Rect = { x: z.rect.x + pad, y: z.rect.y + pad, w: z.rect.w - 2 * pad, h: z.rect.h - 2 * pad };
    const overflow = Math.max(s - r.x, s - r.y, r.x + r.w - (size.width - s), r.y + r.h - (size.height - s));
    if (overflow <= 0.01) return;
    const message =
      overflow > s + 0.01
        ? `«${z.id}» se sale del corte (${fmt(overflow - s)} mm)`
        : `«${z.id}» entra ${fmt(overflow)} mm en la zona peligrosa`;
    issues.push({ index, zone: z.id, message });
  });
  return issues;
}
