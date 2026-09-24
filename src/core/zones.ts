import type { CardSize, FontSpec, Project, Zone, ZoneType } from './types';

export const ZONE_LABELS: Record<ZoneType, string> = {
  image: 'Imagen',
  text: 'Texto',
  attributes: 'Lista de atributos',
  attribute: 'Atributo fijo',
  shape: 'Forma',
};

export const CARD_PRESETS: { name: string; width: number; height: number }[] = [
  { name: 'Póker', width: 63, height: 88 },
  { name: 'Bridge', width: 56, height: 87 },
  { name: 'Mini americana', width: 41, height: 63 },
  { name: 'Mini europea', width: 44, height: 68 },
  { name: 'Tarot', width: 70, height: 120 },
  { name: 'Cuadrada', width: 70, height: 70 },
];

const TEXT_FONT: FontSpec = { family: 'Georgia, serif', size: 8, color: '#000000' };
const VALUE_FONT: FontSpec = {
  family: 'Georgia, serif',
  size: 11,
  weight: 'bold',
  color: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 0.4,
};

export function uniqueId(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Zona nueva con valores razonables, centrada en la carta. */
export function newZone(type: ZoneType, project: Project, size: CardSize, taken: string[]): Zone {
  const centered = (w: number, h: number) => ({
    x: Math.round((size.width - w) * 2) / 4,
    y: Math.round((size.height - h) * 2) / 4,
    w,
    h,
  });
  switch (type) {
    case 'image':
      return { id: uniqueId('imagen', taken), type, bind: '', fit: 'cover', rect: centered(size.width / 2, size.height / 4) };
    case 'text':
      return {
        id: uniqueId('texto', taken),
        type,
        bind: 'texto',
        font: { ...TEXT_FONT },
        align: 'left',
        valign: 'top',
        padding: 1,
        minSize: 6,
        rect: centered(size.width - 10, 15),
      };
    case 'attributes':
      return {
        id: uniqueId('atributos', taken),
        type,
        bind: 'atributos',
        direction: 'column',
        align: 'start',
        gap: 1,
        iconSize: 8,
        valuePosition: 'over',
        font: { ...VALUE_FONT },
        rect: { x: 3, y: 15, w: 10, h: 40 },
      };
    case 'shape':
      return {
        id: uniqueId('forma', taken),
        type,
        shape: 'rect',
        fill: '#2f5d8a',
        radius: 1.5,
        rect: centered(30, 10),
      };
    case 'attribute': {
      const key = Object.keys(project.attributes)[0] ?? '';
      return {
        id: uniqueId(key || 'atributo', taken),
        type,
        key,
        valuePosition: 'over',
        font: { ...VALUE_FONT },
        rect: centered(9, 9),
      };
    }
  }
}
