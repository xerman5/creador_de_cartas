import { normalizeKey } from '../text';

/** Lo que puede llevar una carta. El asistente lo pregunta en lenguaje de juego, no de zonas. */
export type ElementKey = 'art' | 'subtitle' | 'rules' | 'flavor' | 'cost' | 'stats' | 'variant' | 'number';

export const ELEMENTS: { key: ElementKey; label: string; hint: string }[] = [
  { key: 'art', label: 'Ilustración', hint: 'La imagen principal de la carta.' },
  { key: 'subtitle', label: 'Línea de tipo', hint: 'Un texto corto bajo el título: «Criatura — Dragón».' },
  { key: 'rules', label: 'Texto de reglas', hint: 'Lo que hace la carta. Admite iconos: {ataque}.' },
  { key: 'flavor', label: 'Texto de ambientación', hint: 'Una frase en cursiva que no afecta al juego.' },
  { key: 'cost', label: 'Coste', hint: 'Un número en una esquina: lo que cuesta jugarla.' },
  { key: 'stats', label: 'Atributos y habilidades', hint: 'Iconos con número (Ataque 3, Vida 5) o solo icono (Volar, Veneno).' },
  { key: 'variant', label: 'Rareza o categoría', hint: 'Una marca de color que cambia de carta a carta: común/rara/épica… (las clases van aparte, en los tipos).' },
  { key: 'number', label: 'Número de colección', hint: '«012/120» en el pie de la carta.' },
];

/**
 * Lo que el usuario escribe de una carta. Claves: las columnas de texto del CSV (`titulo`,
 * o `titulo-es`, `titulo-en`… con varios idiomas), `attr:<clave>` por atributo, `coste`,
 * `variante`, `ilustracion`, `copias` e `id`. Lo que falta se rellena con textos de ejemplo.
 */
export type CardData = Record<string, string>;

export interface TypeAnswer {
  /** El tipo o subclase: «Ataque», «Lugar». */
  label: string;
  /** Clase a la que pertenece (opcional): «Elfo». Cada clase + subclase es un tipo con su propia maqueta. */
  clase?: string;
  count: number;
  elements: ElementKey[];
  /** Claves de los atributos que usa este tipo (sin el coste). */
  attributes: string[];
  /** Mismo contenido que otro tipo (su nombre completo, `fullName`): comparte elementos y atributos. */
  sameAs?: string;
  /** Datos de sus cartas, en orden; puede tener menos filas que `count`. */
  cards?: CardData[];
  /** Ajustes solo de este tipo: se aplican encima de los de todos (`WizardAnswers.fine`). */
  fine?: Partial<FineTune>;
}

/** `number`: icono con un número que cambia en cada carta (Ataque 3). `icon`: solo icono, la carta lo tiene o no (Volar). */
export type AttrKind = 'number' | 'icon';

export interface AttrAnswer {
  label: string;
  color: string;
  kind?: AttrKind;
  /** Icono propio: ruta dentro de assets/ (`iconos/volar.png`). Sin él se usa uno provisional de su color. */
  icon?: string;
}

export const isAbility = (at: Pick<AttrAnswer, 'kind'> | undefined) => at?.kind === 'icon';

/** ¿Una celda de habilidad dice que la carta la tiene? Vacío, «no», «0» o «-» es que no. */
export const flagOn = (v: string | undefined) => !!v?.trim() && !/^(no|n|0|false|falso|-)$/i.test(v.trim());

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
  /** Fuentes propias (nombre de familia) para títulos y para textos, en lugar de las de la combinación. */
  titleFont?: string;
  bodyFont?: string;
  palette: Palette;
}

/** Letra de títulos y de textos: la combinación elegida o las fuentes propias, con la combinación de reserva. */
export function fontStackOf(adjust: Pick<Adjust, 'fonts' | 'titleFont' | 'bodyFont'>): { title: string; body: string } {
  const pair = FONT_PAIRS[adjust.fonts] ?? FONT_PAIRS.clasica;
  return {
    title: adjust.titleFont ? `"${adjust.titleFont}", ${pair.title}` : pair.title,
    body: adjust.bodyFont ? `"${adjust.bodyFont}", ${pair.body}` : pair.body,
  };
}

export const fontStack = (a: Pick<WizardAnswers, 'adjust'>) => fontStackOf(a.adjust);

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
  /** Tipo de letra: la de los títulos, la de los textos o una fuente propia (su nombre de familia). */
  font?: 'title' | 'body' | (string & {});
  bold?: boolean;
  italic?: boolean;
}

/** Iconos de una zona de atributos, habilidades o coste. */
export interface IconStyle {
  /** Tamaño respecto al máximo que cabe (0,5–1). */
  scale?: number;
  /** Dónde va el número (atributos). */
  value?: 'over' | 'after' | 'below';
  /** Escribir el nombre junto al icono (habilidades). */
  labels?: boolean;
  /** Fondo de cada icono (habilidades); `none` = sin fondo. */
  backdrop?: PieceColor;
  align?: 'start' | 'center' | 'end';
}

/** Imágenes de la carta entera: van en `assets/fondos/`. */
export interface CardImages {
  /** Debajo de todo. */
  background?: string;
  /** Encima de la ilustración y las formas, debajo de los textos: un PNG con transparencia. */
  frame?: string;
}

/**
 * Ajuste fino por pieza del diseño (por id de zona). El de `WizardAnswers` vale para todos los tipos;
 * el de cada tipo (`TypeAnswer.fine`) se aplica encima.
 */
export interface FineTune {
  pieces: Record<string, PieceStyle>;
  texts: Record<string, TextStyle>;
  icons?: Record<string, IconStyle>;
  images?: CardImages;
  /** Distribución: tamaño de la ilustración, lado de los atributos, esquina del coste. */
  layout?: Partial<Pick<Adjust, 'art' | 'attrSide' | 'costCorner'>>;
}

/** Une el ajuste de todos con el de un tipo (el del tipo manda, pieza a pieza). */
export function mergeFine(base: FineTune, over: Partial<FineTune> | undefined): FineTune {
  if (!over) return base;
  const merge = <T extends object>(a: Record<string, T> | undefined, b: Record<string, T> | undefined) => {
    const out: Record<string, T> = { ...a };
    for (const [k, v] of Object.entries(b ?? {})) out[k] = { ...out[k], ...v };
    return out;
  };
  return {
    pieces: merge(base.pieces, over.pieces),
    texts: merge(base.texts, over.texts),
    icons: merge(base.icons, over.icons),
    images: { ...base.images, ...over.images },
    layout: { ...base.layout, ...over.layout },
  };
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
  /** Icono propio del coste (ruta dentro de assets/). */
  costIcon?: string;
  /** Fuentes propias subidas: nombre de familia y archivo dentro de assets/ (`fuentes/cinzel.ttf`). */
  fonts?: { family: string; file: string }[];
  /** Ajustes de la trasera: su dibujo (`images.background`), la banda y sus textos. */
  backFine?: Partial<FineTune>;
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
    fine: { ...raw.fine, pieces: { ...raw.fine?.pieces }, texts: { ...raw.fine?.texts } },
  };
}

/** Clave de un campo de texto: `titulo` con un idioma, `titulo-en` con varios. */
export function textKey(field: string, lang: string, langs: string[]): string {
  return langs.length > 1 ? `${field}-${lang}` : field;
}

const TEXT_FIELDS = ['titulo', 'subtipo', 'descripcion', 'sabor'];

/**
 * Cartas con las claves de texto de otros idiomas: con un idioma, `titulo`; con varios, `titulo-es`…
 * Lo escrito en un idioma que se quita se guarda aparte (`titulo-en`) y vuelve si se añade otra vez.
 */
export function relang(types: TypeAnswer[], from: string[], to: string[]): TypeAnswer[] {
  const all = [...new Set([...from, ...to])];
  return types.map((t) => {
    if (!t.cards?.length) return t;
    const cards = t.cards.map((c) => {
      const out: CardData = { ...c };
      const values = new Map<string, string>();
      for (const f of TEXT_FIELDS)
        for (const l of all) {
          const v = from.includes(l) ? c[textKey(f, l, from)] : c[`${f}-${l}`];
          if (v !== undefined) values.set(`${f}|${l}`, v);
        }
      for (const f of TEXT_FIELDS) {
        delete out[f];
        for (const l of all) delete out[`${f}-${l}`];
      }
      for (const [k, v] of values) {
        const [f, l] = k.split('|');
        out[to.includes(l) ? textKey(f, l, to) : `${f}-${l}`] = v;
      }
      return out;
    });
    return { ...t, cards };
  });
}

/** Nombre completo de un tipo: «Elfo Ataque» (o «Lugar» sin clase). Es el valor de la columna «tipo» y el de su plantilla. */
export const fullName = (t: Pick<TypeAnswer, 'label' | 'clase'>) => [t.clase?.trim(), t.label.trim()].filter(Boolean).join(' ');
/** Para enseñar: «Elfo · Ataque». */
export const typeLabel = (t: Pick<TypeAnswer, 'label' | 'clase'>) => [t.clase?.trim(), t.label.trim()].filter(Boolean).join(' · ');
export const typeKey = (t: Pick<TypeAnswer, 'label' | 'clase'>) => normalizeKey(fullName(t));
export const attrKey = (a: Pick<AttrAnswer, 'label'>) => normalizeKey(a.label);

/**
 * Elementos y atributos de un tipo, siguiendo «igual que» (sin ciclos).
 * `declared` es lo que el usuario marcó y decide qué preguntar; `elements` es lo que se dibuja:
 * sin atributos elegidos todavía, la lista de atributos no tiene nada que mostrar.
 */
export function resolvedType(
  answers: WizardAnswers,
  t: TypeAnswer,
): { declared: Set<ElementKey>; elements: Set<ElementKey>; attributes: string[]; stats: string[]; abilities: string[] } {
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
  const picked = answers.attributes.filter((at) => attrKey(at) && chosen.has(attrKey(at)));
  const attributes = picked.map(attrKey);
  const declared = new Set(cur.elements);
  const elements = new Set(cur.elements);
  if (!attributes.length) elements.delete('stats');
  const stats = picked.filter((at) => !isAbility(at)).map(attrKey);
  const abilities = picked.filter(isAbility).map(attrKey);
  return { declared, elements, attributes, stats, abilities };
}

/** Nombre de archivo seguro a partir de una etiqueta. */
export function fileKey(s: string): string {
  return (
    normalizeKey(s)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  );
}
