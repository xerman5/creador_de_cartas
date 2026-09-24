import { normalizeKey } from '../text';

/** Lo que puede llevar una carta. El asistente lo pregunta en lenguaje de juego, no de zonas. */
export type ElementKey = 'art' | 'subtitle' | 'rules' | 'flavor' | 'cost' | 'stats' | 'variant' | 'number';

export const ELEMENTS: { key: ElementKey; label: string; hint: string }[] = [
  { key: 'art', label: 'Ilustración', hint: 'La imagen principal de la carta.' },
  { key: 'subtitle', label: 'Línea de tipo', hint: 'Un texto corto bajo el título: «Criatura — Dragón».' },
  { key: 'rules', label: 'Texto de reglas', hint: 'Lo que hace la carta. Admite iconos: {ataque}.' },
  { key: 'flavor', label: 'Texto de ambientación', hint: 'Una frase en cursiva que no afecta al juego.' },
  { key: 'cost', label: 'Coste', hint: 'Un número en una esquina: lo que cuesta jugarla.' },
  { key: 'stats', label: 'Atributos', hint: 'Números con icono que cambian en cada carta: Ataque 3, Vida 5…' },
  { key: 'variant', label: 'Rareza, clan o facción', hint: 'Una categoría con su color: común/rara, un clan, una facción…' },
  { key: 'number', label: 'Número de colección', hint: '«012/120» en el pie de la carta.' },
];

/**
 * Lo que el usuario escribe de una carta. Claves: las columnas de texto del CSV (`titulo`,
 * o `titulo-es`, `titulo-en`… con varios idiomas), `attr:<clave>` por atributo, `coste`,
 * `variante`, `ilustracion`, `copias` e `id`. Lo que falta se rellena con textos de ejemplo.
 */
export type CardData = Record<string, string>;

export interface TypeAnswer {
  label: string;
  count: number;
  elements: ElementKey[];
  /** Claves de los atributos que usa este tipo (sin el coste). */
  attributes: string[];
  /** Mismo contenido que otro tipo (su etiqueta): comparte elementos y atributos. */
  sameAs?: string;
  /** Datos de sus cartas, en orden; puede tener menos filas que `count`. */
  cards?: CardData[];
}

export interface AttrAnswer {
  label: string;
  color: string;
}

export type DesignId = 'clasico' | 'completa' | 'retrato' | 'texto';

export const DESIGNS: { id: DesignId; label: string; hint: string }[] = [
  { id: 'clasico', label: 'Clásico', hint: 'Título arriba, ilustración, caja de reglas. Sirve para casi todo.' },
  { id: 'completa', label: 'Ilustración completa', hint: 'El arte ocupa toda la carta y el texto va sobre bandas.' },
  { id: 'retrato', label: 'Retrato', hint: 'Ilustración grande con placa de nombre y columna de atributos.' },
  { id: 'texto', label: 'Texto', hint: 'Tipografía grande y limpia: preguntas, eventos, party games.' },
];

export interface Palette {
  principal: string;
  acento: string;
  papel: string;
  tinta: string;
}

export const PALETTES: Record<string, { label: string; colors: Palette }> = {
  noche: { label: 'Noche', colors: { principal: '#1f3a5f', acento: '#e0a526', papel: '#efe6d2', tinta: '#2a2118' } },
  bosque: { label: 'Bosque', colors: { principal: '#2f5b3a', acento: '#d9a441', papel: '#eef0e2', tinta: '#1f2a1c' } },
  carmesi: { label: 'Carmesí', colors: { principal: '#7a1f2b', acento: '#e6b450', papel: '#f3e7dc', tinta: '#2b1a17' } },
  pizarra: { label: 'Pizarra', colors: { principal: '#3a4250', acento: '#4fb3bf', papel: '#eef1f4', tinta: '#1d232b' } },
  pastel: { label: 'Pastel', colors: { principal: '#6d5ba6', acento: '#f29e8e', papel: '#fbf6ee', tinta: '#3a3350' } },
};

/** Solo fuentes del sistema: el proyecto funciona sin instalar nada. */
export const FONT_PAIRS: Record<string, { label: string; title: string; body: string }> = {
  clasica: { label: 'Clásica', title: 'Georgia, serif', body: 'Georgia, serif' },
  moderna: { label: 'Moderna', title: 'Trebuchet MS, Helvetica, Arial, sans-serif', body: 'Arial, Helvetica, sans-serif' },
  elegante: {
    label: 'Elegante',
    title: 'Palatino Linotype, Palatino, Book Antiqua, serif',
    body: 'Palatino Linotype, Palatino, Book Antiqua, serif',
  },
  impacto: { label: 'Impacto', title: 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif', body: 'Arial, Helvetica, sans-serif' },
};

export interface Adjust {
  /** Parte del espacio libre para la ilustración (0,3–0,75). */
  art: number;
  attrSide: 'left' | 'right' | 'bottom';
  costCorner: 'left' | 'right';
  rounded: boolean;
  fonts: string;
  palette: Palette;
}

/** Colores de la paleta para piezas y textos; `none` = transparente. */
export type PieceColor = 'principal' | 'acento' | 'papel' | 'tinta' | 'none';

export interface PieceStyle {
  fill?: PieceColor;
  /** 0–1. */
  opacity?: number;
  border?: boolean;
}

export interface TextStyle {
  /** Multiplica el tamaño de letra (0,7–1,5). */
  scale?: number;
  color?: Exclude<PieceColor, 'none'>;
  align?: 'left' | 'center' | 'right' | 'justify';
}

/** Ajuste fino por pieza del diseño (por id de zona): se aplica a todos los tipos. */
export interface FineTune {
  pieces: Record<string, PieceStyle>;
  texts: Record<string, TextStyle>;
}

export interface WizardAnswers {
  name: string;
  langs: string[];
  size: { width: number; height: number };
  types: TypeAnswer[];
  attributes: AttrAnswer[];
  /** Columna y valores de la marca de rareza o facción. */
  variant: { column: string; values: { name: string; color: string }[] };
  design: DesignId;
  adjust: Adjust;
  backs: 'common' | 'per-type' | 'none';
  fine: FineTune;
}

export function defaultAnswers(): WizardAnswers {
  return {
    name: 'Mi juego',
    langs: ['es'],
    size: { width: 63, height: 88 },
    types: [{ label: '', count: 20, elements: ['art', 'rules', 'flavor', 'number'], attributes: [] }],
    attributes: [
      { label: 'Ataque', color: '#d9534f' },
      { label: 'Vida', color: '#4caf50' },
    ],
    variant: {
      column: 'Rareza',
      values: [
        { name: 'Común', color: '#9aa7b8' },
        { name: 'Rara', color: '#3d8fe0' },
        { name: 'Épica', color: '#a45bd6' },
        { name: 'Legendaria', color: '#f0b429' },
      ],
    },
    design: 'clasico',
    adjust: { art: 0.55, attrSide: 'left', costCorner: 'right', rounded: true, fonts: 'clasica', palette: { ...PALETTES.noche.colors } },
    backs: 'common',
    fine: { pieces: {}, texts: {} },
  };
}

/** Respuestas de un borrador o de un archivo de progreso, completadas con lo que falte. */
export function withDefaults(raw: Partial<WizardAnswers> | null | undefined): WizardAnswers {
  const d = defaultAnswers();
  if (!raw || typeof raw !== 'object') return d;
  return {
    ...d,
    ...raw,
    size: { ...d.size, ...raw.size },
    langs: Array.isArray(raw.langs) && raw.langs.length ? raw.langs : d.langs,
    types: Array.isArray(raw.types)
      ? raw.types.map((t: Partial<TypeAnswer>) => ({ label: '', count: 1, elements: [], attributes: [], ...t }))
      : d.types,
    attributes: Array.isArray(raw.attributes) ? raw.attributes : d.attributes,
    variant: { ...d.variant, ...raw.variant },
    adjust: { ...d.adjust, ...raw.adjust, palette: { ...d.adjust.palette, ...raw.adjust?.palette } },
    fine: { pieces: { ...raw.fine?.pieces }, texts: { ...raw.fine?.texts } },
  };
}

/** Clave de un campo de texto: `titulo` con un idioma, `titulo-en` con varios. */
export function textKey(field: string, lang: string, langs: string[]): string {
  return langs.length > 1 ? `${field}-${lang}` : field;
}

export const typeKey = (t: Pick<TypeAnswer, 'label'>) => normalizeKey(t.label);
export const attrKey = (a: Pick<AttrAnswer, 'label'>) => normalizeKey(a.label);

/**
 * Elementos y atributos de un tipo, siguiendo «igual que» (sin ciclos).
 * `declared` es lo que el usuario marcó y decide qué preguntar; `elements` es lo que se dibuja:
 * sin atributos elegidos todavía, la lista de atributos no tiene nada que mostrar.
 */
export function resolvedType(
  answers: WizardAnswers,
  t: TypeAnswer,
): { declared: Set<ElementKey>; elements: Set<ElementKey>; attributes: string[] } {
  let cur = t;
  const seen = new Set<string>();
  while (cur.sameAs && !seen.has(typeKey(cur))) {
    seen.add(typeKey(cur));
    const next = answers.types.find((o) => typeKey(o) === normalizeKey(cur.sameAs!));
    if (!next) break;
    cur = next;
  }
  // El orden de dibujo es el de la lista de atributos del juego, no el orden en que se marcaron.
  const chosen = new Set(cur.attributes.map(normalizeKey));
  const attributes = answers.attributes.map(attrKey).filter((k) => k && chosen.has(k));
  const declared = new Set(cur.elements);
  const elements = new Set(cur.elements);
  if (!attributes.length) elements.delete('stats');
  return { declared, elements, attributes };
}

/** Nombre de archivo seguro a partir de una etiqueta. */
export function fileKey(s: string): string {
  return (
    normalizeKey(s)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  );
}
