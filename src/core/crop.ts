/**
 * Encuadre de una imagen dentro de su zona (solo con «cubrir»): qué punto de la imagen queda en
 * el centro de la zona y cuánto se amplía. En el CSV: «30% 40% 1.5» (x, y, zoom); vacío = centrada.
 */
export interface Crop {
  /** 0–1: punto de la imagen que va al centro de la zona (0 = borde izquierdo/superior). */
  x: number;
  y: number;
  /** ≥ 1: ampliación sobre lo mínimo que cubre la zona. */
  zoom: number;
}

export const CENTERED: Crop = { x: 0.5, y: 0.5, zoom: 1 };
export const MAX_ZOOM = 5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function parseCrop(src: string | undefined): Crop {
  const parts = (src ?? '').trim().split(/[\s,;]+/).filter(Boolean);
  if (!parts.length) return CENTERED;
  const pct = (s: string | undefined, d: number) => {
    const n = parseFloat((s ?? '').replace('%', ''));
    return Number.isFinite(n) ? clamp(n / 100, 0, 1) : d;
  };
  const zoom = parseFloat(parts[2] ?? '');
  return { x: pct(parts[0], 0.5), y: pct(parts[1], 0.5), zoom: Number.isFinite(zoom) ? clamp(zoom, 1, MAX_ZOOM) : 1 };
}

export function formatCrop(c: Crop): string {
  const r = (v: number) => Math.round(v * 1000) / 10;
  if (Math.abs(c.x - 0.5) < 0.001 && Math.abs(c.y - 0.5) < 0.001 && Math.abs(c.zoom - 1) < 0.001) return '';
  return `${r(c.x)}% ${r(c.y)}% ${Math.round(c.zoom * 100) / 100}`;
}

/**
 * Rectángulo donde se dibuja la imagen (iw×ih) para cubrir `r` con ese encuadre. El punto elegido
 * va al centro de la zona salvo que eso dejara un hueco: entonces se acerca al borde lo justo.
 */
export function coverRect(iw: number, ih: number, r: { x: number; y: number; w: number; h: number }, c: Crop) {
  const s = Math.max(r.w / iw, r.h / ih) * c.zoom;
  const w = iw * s;
  const h = ih * s;
  const x = clamp(r.x + r.w / 2 - c.x * w, r.x + r.w - w, r.x);
  const y = clamp(r.y + r.h / 2 - c.y * h, r.y + r.h - h, r.y);
  return { x, y, w, h };
}
