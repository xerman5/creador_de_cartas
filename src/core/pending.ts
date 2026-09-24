import type { LoadedProject } from './project';
import { normalizeKey } from './text';
import { BACK_TEMPLATE, PLACEHOLDERS, PROVISIONAL_DIR } from './wizard/build';

export interface PendingItem {
  id: 'art' | 'icons' | 'back' | 'titles' | 'rules' | 'flavor';
  label: string;
  hint: string;
  /** Filas afectadas (vacío para lo que no depende de una carta, como los iconos). */
  rows: number[];
  count: number;
}

const isProvisional = (path: string | undefined) => !!path && path.replace(/\\/g, '/').startsWith(PROVISIONAL_DIR);
const RULES = new Set(Object.values(PLACEHOLDERS).map((p) => p.rules));
const FLAVOR = new Set(Object.values(PLACEHOLDERS).map((p) => p.flavor));

/** Columnas de un campo en todos los idiomas: `descripcion`, `descripcion-es`, `descripcion-en`… */
function fieldColumns(columns: string[], field: string): string[] {
  return columns.filter((c) => c === field || new RegExp(`^${field}-[a-z]{2}$`).test(c));
}

/**
 * Lo que falta para terminar la baraja: imágenes provisionales del asistente y textos de relleno.
 * Solo aparece lo que existe; un proyecto hecho a mano no tiene pendientes.
 */
export function pendingItems(lp: LoadedProject): PendingItem[] {
  const { project, rows, columns } = lp;
  const items: PendingItem[] = [];
  const art: number[] = [];
  const titles: number[] = [];
  const rules: number[] = [];
  const flavor: number[] = [];
  const backTemplates = new Set<string>();
  const titleCols = fieldColumns(columns, 'titulo');
  const rulesCols = fieldColumns(columns, 'descripcion');
  const flavorCols = fieldColumns(columns, 'sabor');

  rows.forEach((row, i) => {
    const tipo = normalizeKey(row.tipo ?? '');
    const tpl = project.templates[tipo];
    if (!tpl) return;
    for (const z of tpl.zones) {
      if (z.type !== 'image' || z.hidden || !isProvisional(z.default)) continue;
      if (!z.bind) backTemplates.add(tipo);
      else if (!(row[normalizeKey(z.bind)] ?? '').trim()) {
        art.push(i);
        break;
      }
    }
    if (tipo === BACK_TEMPLATE) return;
    const placeholderTitle = new RegExp(`^${(row.tipo ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+$`);
    if (titleCols.some((c) => placeholderTitle.test((row[c] ?? '').trim()))) titles.push(i);
    if (rulesCols.some((c) => [...RULES].some((p) => (row[c] ?? '').trim().startsWith(p)))) rules.push(i);
    if (flavorCols.some((c) => FLAVOR.has((row[c] ?? '').trim()))) flavor.push(i);
  });

  const icons = Object.entries(project.attributes).filter(([, d]) => isProvisional(d.icon));

  if (art.length)
    items.push({
      id: 'art',
      label: `${art.length} ${art.length === 1 ? 'ilustración provisional' : 'ilustraciones provisionales'}`,
      hint: 'Copia tus imágenes en assets/ y escribe la ruta de cada una en la columna «ilustracion» (p. ej. ilustraciones/dragon.png).',
      rows: art,
      count: art.length,
    });
  if (titles.length)
    items.push({
      id: 'titles',
      label: `${titles.length} ${titles.length === 1 ? 'título por escribir' : 'títulos por escribir'}`,
      hint: 'Columna «titulo» del CSV.',
      rows: titles,
      count: titles.length,
    });
  if (rules.length)
    items.push({
      id: 'rules',
      label: `${rules.length} ${rules.length === 1 ? 'texto de reglas' : 'textos de reglas'} por escribir`,
      hint: 'Columna «descripcion». **negrita**, *cursiva* y {atributo} para iconos.',
      rows: rules,
      count: rules.length,
    });
  if (flavor.length)
    items.push({
      id: 'flavor',
      label: `${flavor.length} ${flavor.length === 1 ? 'frase' : 'frases'} de ambientación por escribir`,
      hint: 'Columna «sabor»; déjala vacía si una carta no la lleva.',
      rows: flavor,
      count: flavor.length,
    });
  if (icons.length)
    items.push({
      id: 'icons',
      label: `${icons.length} ${icons.length === 1 ? 'icono provisional' : 'iconos provisionales'}: ${icons.map(([k]) => k).join(', ')}`,
      hint: 'Cámbialos en Proyecto › Atributos.',
      rows: [],
      count: icons.length,
    });
  if (backTemplates.size)
    items.push({
      id: 'back',
      label: 'Dibujo provisional en la trasera',
      hint: 'Cámbialo en Plantillas › trasera, zona «dibujo».',
      rows: rows.flatMap((r, i) => (backTemplates.has(normalizeKey(r.tipo ?? '')) ? [i] : [])),
      count: backTemplates.size,
    });
  return items;
}
