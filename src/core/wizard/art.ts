// Imágenes provisionales en SVG: el mazo se ve completo desde el primer minuto y el
// usuario solo tiene que sustituirlas. Todas van en assets/provisional/.

import type { Palette } from './answers';

function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x808080;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Mismo color con el tono girado `deg` grados y la luminosidad desplazada `dl`. */
export function shiftColor(hex: string, deg: number, dl = 0): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((((h + deg) % 360) + 360) % 360, s, Math.min(0.92, Math.max(0.08, l + dl)));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Paisaje provisional con la proporción de la zona (w×h en mm). `hue` desplaza el color
 * para que cada tipo de carta se distinga a simple vista.
 */
export function artSvg(w: number, h: number, p: Palette, hue: number, label: string): string {
  const W = Math.round(w * 10);
  const H = Math.round(h * 10);
  const sky1 = shiftColor(p.principal, hue, 0.12);
  const sky2 = shiftColor(p.acento, hue, 0.15);
  const far = shiftColor(p.principal, hue, -0.02);
  const near = shiftColor(p.principal, hue, -0.14);
  const sun = shiftColor(p.acento, hue, 0.05);
  const hill = (base: number, amp: number, seed: number) => {
    const pts: string[] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const x = (W * i) / n;
      const y = H * base - Math.abs(Math.sin(i * 1.7 + seed)) * H * amp;
      pts.push(`${x.toFixed(0)},${y.toFixed(0)}`);
    }
    return `M0,${H} L${pts.join(' L')} L${W},${H} Z`;
  };
  const fs = Math.max(16, Math.min(W * 0.04, H * 0.07));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#c)"/>
<circle cx="${(W * 0.72).toFixed(0)}" cy="${(H * 0.32).toFixed(0)}" r="${(Math.min(W, H) * 0.14).toFixed(0)}" fill="${sun}" opacity="0.9"/>
<path d="${hill(0.72, 0.28, 0.4)}" fill="${far}"/>
<path d="${hill(0.9, 0.2, 2.1)}" fill="${near}"/>
<text x="${W / 2}" y="${(H * 0.48).toFixed(0)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fs.toFixed(0)}" fill="#ffffff" fill-opacity="0.75">${esc(label)}</text>
</svg>`;
}

const SHAPES = ['hexagon', 'diamond', 'heart', 'shield', 'star', 'circle', 'square', 'triangle'] as const;

/** Icono provisional de atributo: una forma de color distinta para cada uno. */
export function iconSvg(index: number, color: string, ink: string): string {
  const shape = SHAPES[index % SHAPES.length];
  const light = shiftColor(color, 0, 0.12);
  const paths: Record<(typeof SHAPES)[number], string> = {
    hexagon: 'M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z',
    diamond: 'M50 4 L94 50 L50 96 L6 50 Z',
    heart: 'M50 92 C12 64 4 42 18 24 C30 10 46 14 50 30 C54 14 70 10 82 24 C96 42 88 64 50 92 Z',
    shield: 'M50 4 L90 16 C90 56 76 80 50 96 C24 80 10 56 10 16 Z',
    star: 'M50 4 L62 36 L96 38 L69 59 L79 94 L50 74 L21 94 L31 59 L4 38 L38 36 Z',
    circle: 'M50 6 A44 44 0 1 1 49.9 6 Z',
    square: 'M12 12 H88 V88 H12 Z',
    triangle: 'M50 6 L94 90 H6 Z',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${color}"/></linearGradient></defs>
<path d="${paths[shape]}" fill="url(#g)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
</svg>`;
}

/** Moneda del coste. */
export function costSvg(p: Palette): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<circle cx="50" cy="50" r="45" fill="${p.acento}" stroke="${p.tinta}" stroke-width="6"/>
<circle cx="50" cy="50" r="34" fill="none" stroke="${shiftColor(p.acento, 0, 0.2)}" stroke-width="4"/>
</svg>`;
}

/** Dibujo de la trasera: rombos del color principal sobre el mismo color más oscuro. */
export function backSvg(p: Palette, w: number, h: number): string {
  const W = Math.round(w * 10);
  const H = Math.round(h * 10);
  const dark = shiftColor(p.principal, 0, -0.08);
  const light = shiftColor(p.principal, 0, 0.06);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><pattern id="r" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="${dark}"/><path d="M30 4 L56 30 L30 56 L4 30 Z" fill="${light}"/></pattern></defs>
<rect width="${W}" height="${H}" fill="url(#r)"/>
</svg>`;
}
