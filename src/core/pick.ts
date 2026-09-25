import { conditionMatches } from './condition';
import type { CardRow, Template, Zone } from './types';

/**
 * La zona de la plantilla que hay en un punto de la carta (en mm desde el corte): la de más arriba
 * que se dibuja en esa carta, prefiriendo textos, iconos e imágenes a las formas de fondo.
 */
export function zoneAt(tpl: Template | undefined, row: CardRow, lang: string, x: number, y: number): Zone | null {
  const hit = (tpl?.zones ?? []).filter(
    (z) => !z.hidden && conditionMatches(z.showIf, row, lang) && x >= z.rect.x && x <= z.rect.x + z.rect.w && y >= z.rect.y && y <= z.rect.y + z.rect.h,
  );
  const content = hit.filter((z) => z.type === 'text' || z.type === 'attribute' || z.type === 'attributes');
  const pool = content.length ? content : hit.filter((z) => z.type === 'image').length ? hit.filter((z) => z.type === 'image') : hit;
  return pool[pool.length - 1] ?? null;
}
