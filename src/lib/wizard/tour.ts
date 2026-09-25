import type { Zone } from '../../core/types';
import { normalizeKey } from '../../core/text';
import { typeKey, type ElementKey, type FineTune, type TypeAnswer, type WizardAnswers } from '../../core/wizard/answers';
import type { ShelfId } from '../../core/wizard/resources';

/** Biblioteca del asistente (iconos y fondos subidos). */
export interface Library {
  items(shelf: ShelfId): { path: string; url: string }[];
  add(files: File[], shelf: ShelfId): string[];
  remove(path: string): void;
  url(path: string | undefined): string | undefined;
}

/** Un paso del recorrido: un elemento de la carta y las zonas que lo forman. */
export interface TourElement {
  id: string;
  label: string;
  hint: string;
  /** Zonas que se resaltan y se ajustan (la primera es la que decide si el elemento existe). */
  zones: string[];
}

const ELEMENTS: TourElement[] = [
  { id: 'fondo', label: 'Fondo y marco', hint: 'El fondo de la carta y, si quieres, una imagen de fondo o un marco con transparencia.', zones: ['fondo', 'marco', 'fondo imagen', 'marco imagen'] },
  { id: 'ilustracion', label: 'Ilustración', hint: 'Su tamaño, su marco y cómo encaja la imagen.', zones: ['ilustracion', 'marco ilustracion'] },
  { id: 'titulo', label: 'Título', hint: 'El nombre de la carta y la banda o placa que lo lleva.', zones: ['titulo', 'cabecera', 'placa'] },
  { id: 'linea', label: 'Línea de tipo', hint: 'El texto corto bajo el título.', zones: ['linea de tipo', 'banda tipo'] },
  { id: 'reglas', label: 'Reglas', hint: 'El texto de reglas y la caja que lo contiene.', zones: ['reglas', 'caja de texto', 'panel'] },
  { id: 'ambientacion', label: 'Ambientación', hint: 'La frase en cursiva.', zones: ['ambientacion'] },
  { id: 'atributos', label: 'Atributos', hint: 'Los iconos con número: dónde van, su tamaño y dónde se escribe el número.', zones: ['atributos', 'fondo atributos'] },
  { id: 'habilidades', label: 'Habilidades', hint: 'Los iconos sin número: su tamaño, su fondo y si llevan el nombre escrito.', zones: ['habilidades'] },
  { id: 'coste', label: 'Coste', hint: 'Su esquina, su tamaño y su icono.', zones: ['coste'] },
  { id: 'rareza', label: 'Rareza o facción', hint: 'La marca de color y sus valores.', zones: ['marca'] },
  { id: 'numero', label: 'Número de colección', hint: 'El «012/120» del pie.', zones: ['numero'] },
];

/** Los elementos que tiene de verdad una plantilla, en orden de recorrido. */
export function tourElements(zones: Zone[]): TourElement[] {
  // Sin zonas, la plantilla aún no se ha dibujado.
  if (!zones.length) return [];
  const ids = new Set(zones.map((z) => z.id));
  return ELEMENTS.filter((e) => e.id === 'fondo' || ids.has(e.zones[0]));
}

export type Scope = 'all' | 'type';

/** Dónde se escribe un ajuste: en el de todos los tipos o en el de este tipo. */
export function fineFor(answers: WizardAnswers, t: TypeAnswer | undefined, scope: Scope): Partial<FineTune> {
  if (scope === 'all' || !t) return answers.fine;
  // En un estado de Svelte, `??=` devuelve el objeto sin envolver: se vuelve a leer.
  t.fine ??= {};
  return t.fine;
}

/** Qué elemento del asistente («Qué lleva cada carta») es cada paso del recorrido. */
export const ELEMENT_OF: Record<string, ElementKey | undefined> = {
  ilustracion: 'art',
  linea: 'subtitle',
  reglas: 'rules',
  ambientacion: 'flavor',
  atributos: 'stats',
  habilidades: 'stats',
  coste: 'cost',
  rareza: 'variant',
  numero: 'number',
};

/** El tipo que decide el contenido: el mismo o, si es «igual que» otro, ese otro. */
export function contentType(answers: WizardAnswers, t: TypeAnswer): TypeAnswer {
  let cur = t;
  const seen = new Set<TypeAnswer>();
  while (cur.sameAs && !seen.has(cur)) {
    seen.add(cur);
    const next = answers.types.find((o) => typeKey(o) === normalizeKey(cur.sameAs!));
    if (!next) break;
    cur = next;
  }
  return cur;
}

const LAYOUT_KEYS: Record<string, string[]> = { ilustracion: ['art'], reglas: ['art'], atributos: ['attrSide'], coste: ['costCorner'] };

/** ¿Tiene este tipo ajustes propios en este elemento? */
export function hasOwn(t: TypeAnswer | undefined, el: TourElement): boolean {
  const f = t?.fine;
  if (!f) return false;
  const inZones = (m?: Record<string, object>) => el.zones.some((z) => m?.[z] && Object.keys(m[z]).length);
  if (inZones(f.pieces) || inZones(f.texts) || inZones(f.icons)) return true;
  if (el.id === 'fondo' && f.images && Object.keys(f.images).length) return true;
  return (LAYOUT_KEYS[el.id] ?? []).some((k) => f.layout && k in f.layout);
}

/** Quita los ajustes propios de este tipo en este elemento: vuelve a usar los de todos. */
export function clearOwn(t: TypeAnswer, el: TourElement) {
  const f = t.fine;
  if (!f) return;
  for (const z of el.zones) {
    delete f.pieces?.[z];
    delete f.texts?.[z];
    delete f.icons?.[z];
  }
  if (el.id === 'fondo') delete f.images;
  for (const k of LAYOUT_KEYS[el.id] ?? []) delete (f.layout as Record<string, unknown> | undefined)?.[k];
}
