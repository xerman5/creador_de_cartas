import { normalizeKey } from './text';

export interface AttributeValue {
  key: string;
  value: string;
  /** Icono alternativo solo para esta carta. */
  icon?: string;
}

/**
 * Sintaxis de la celda de atributos:
 *   fuerza:3 | velocidad:5 | vida:10@iconos/corazon-roto.svg | escudo
 * El orden de la celda es el orden de dibujo. El valor puede ser texto ("X", "1d6") o no existir.
 */
export function parseAttributes(src: string): AttributeValue[] {
  return src
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      let icon: string | undefined;
      const at = part.lastIndexOf('@');
      if (at >= 0) {
        icon = part.slice(at + 1).trim() || undefined;
        part = part.slice(0, at).trim();
      }
      const colon = part.indexOf(':');
      const key = normalizeKey(colon >= 0 ? part.slice(0, colon) : part);
      const value = colon >= 0 ? part.slice(colon + 1).trim() : '';
      return { key, value, icon };
    });
}
