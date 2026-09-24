import { AssetStore, type FileSource } from './assets';
import { BLEED_MM, cardSizeFor, DEFAULT_SAFE_MM, safeAreaIssues } from './card';
import { parseCondition } from './condition';
import { detectLangs, parseCsv } from './csv';
import { normalizeKey, readText } from './text';
import type { AttributeDef, CardRow, Project, Template } from './types';

export const PROJECT_FILE = 'proyecto.json';

export interface LoadedProject {
  project: Project;
  rows: CardRow[];
  columns: string[];
  langs: string[];
  assets: AssetStore;
  /** Problemas al leer los archivos (JSON, CSV, fuentes). */
  errors: string[];
}

const ZONE_TYPES = ['image', 'text', 'attributes', 'attribute'];

function normalizeProject(raw: any, errors: string[]): Project {
  const attributes: Record<string, AttributeDef> = {};
  for (const [k, v] of Object.entries(raw.attributes ?? {})) attributes[normalizeKey(k)] = v as AttributeDef;

  const templates: Record<string, Template> = {};
  for (const [k, v] of Object.entries<any>(raw.templates ?? {})) {
    if (!Array.isArray(v?.zones)) {
      errors.push(`La plantilla «${k}» no tiene lista de zonas.`);
      continue;
    }
    v.zones.forEach((z: any, i: number) => {
      z.id ??= `${z.type}-${i + 1}`;
      if (!ZONE_TYPES.includes(z.type)) errors.push(`Plantilla «${k}», zona «${z.id}»: tipo desconocido «${z.type}».`);
    });
    templates[normalizeKey(k)] = v;
  }

  const card = { width: 63, height: 88, safe: DEFAULT_SAFE_MM, ...raw.card };
  if ('bleed' in card) {
    if (card.bleed !== BLEED_MM) errors.push(`El sangrado es fijo de ${BLEED_MM} mm: se ignora «bleed: ${card.bleed}».`);
    delete card.bleed;
  }
  for (const tpl of Object.values(templates)) delete (tpl.size as any)?.bleed;

  return {
    name: raw.name ?? 'Sin nombre',
    csv: raw.csv ?? 'cartas.csv',
    assetsDir: raw.assetsDir ?? 'assets',
    card,
    fonts: raw.fonts ?? [],
    attributes,
    templates,
    ...(raw.export ? { export: raw.export } : {}),
  };
}

/**
 * Lee proyecto.json, el CSV y las fuentes. Con `keep` se conserva ese proyecto
 * (cambios sin guardar) y solo se relee el CSV.
 */
export async function loadProject(source: FileSource, keep?: Project): Promise<LoadedProject> {
  const errors: string[] = [];
  let project = keep;

  if (!project) {
    const jsonBlob = await source.read(PROJECT_FILE);
    if (!jsonBlob) throw new Error(`No se encuentra «${PROJECT_FILE}» en la carpeta «${source.label}».`);
    let raw: unknown;
    try {
      raw = JSON.parse(await readText(jsonBlob));
    } catch (e) {
      throw new Error(`«${PROJECT_FILE}» no es JSON válido: ${(e as Error).message}`);
    }
    project = normalizeProject(raw, errors);
  }

  const csvBlob = await source.read(project.csv);
  if (!csvBlob) throw new Error(`No se encuentra el CSV «${project.csv}».`);
  const csv = parseCsv(await readText(csvBlob));
  errors.push(...csv.errors);

  const assets = new AssetStore(source, project.assetsDir);
  errors.push(...(await assets.loadFonts(project.fonts)));

  return { project, rows: csv.rows, columns: csv.columns, langs: detectLangs(csv.columns), assets, errors };
}

/** Avisos que dependen del proyecto actual (cambian al editar). */
export function projectIssues(lp: LoadedProject): string[] {
  const issues: string[] = [];
  for (const tipo of new Set(lp.rows.map((r) => normalizeKey(r.tipo ?? '')))) {
    if (!lp.project.templates[tipo]) issues.push(`El tipo «${tipo}» no tiene plantilla.`);
  }
  for (const [tipo, tpl] of Object.entries(lp.project.templates)) {
    for (const issue of safeAreaIssues(tpl, cardSizeFor(lp.project, tpl))) issues.push(`Plantilla «${tipo}»: ${issue.message}.`);
  }
  return issues;
}

/** JSON legible, con los rectángulos de las zonas en una sola línea. */
export function serializeProject(p: Project): string {
  return (
    JSON.stringify(p, null, 2).replace(
      /\{\s*"x": ([^,]+),\s*"y": ([^,]+),\s*"w": ([^,]+),\s*"h": ([^\s}]+)\s*\}/g,
      '{ "x": $1, "y": $2, "w": $3, "h": $4 }',
    ) + '\n'
  );
}

export interface TemplateColumn {
  name: string;
  /** Texto traducible: se espera `<nombre>-<idioma>`. */
  localized: boolean;
}

/** Columnas del CSV que usa una plantilla. */
export function templateColumns(tpl: Template): TemplateColumn[] {
  const cols = new Map<string, boolean>();
  for (const z of tpl.zones) {
    const cond = parseCondition(z.showIf ?? '');
    if (cond && !cols.has(cond.column)) cols.set(cond.column, false);
    const bind = z.type === 'attributes' || z.type === 'attribute' ? (z.bind ?? 'atributos') : z.bind;
    if (bind) cols.set(normalizeKey(bind), z.type === 'text' || !!cols.get(normalizeKey(bind)));
  }
  return [...cols].map(([name, localized]) => ({ name, localized }));
}

/** ¿Tiene el CSV esa columna (en algún idioma, si es traducible)? */
export function hasColumn(columns: string[], col: TemplateColumn): boolean {
  return columns.includes(col.name) || (col.localized && columns.some((c) => c.startsWith(`${col.name}-`)));
}

export function defaultProject(name: string): Project {
  return {
    name,
    csv: 'cartas.csv',
    assetsDir: 'assets',
    card: { width: 63, height: 88, safe: DEFAULT_SAFE_MM },
    fonts: [],
    attributes: {},
    templates: {
      carta: {
        zones: [
          {
            id: 'titulo',
            type: 'text',
            bind: 'titulo',
            align: 'center',
            valign: 'middle',
            minSize: 7,
            rect: { x: 5, y: 5, w: 53, h: 10 },
            font: { family: 'Georgia, serif', size: 11, weight: 'bold', color: '#000000' },
          },
          {
            id: 'descripcion',
            type: 'text',
            bind: 'descripcion',
            align: 'left',
            valign: 'top',
            padding: 1,
            minSize: 6,
            rect: { x: 5, y: 55, w: 53, h: 28 },
            font: { family: 'Georgia, serif', size: 8, color: '#000000' },
          },
        ],
      },
    },
  };
}

export const DEFAULT_CSV =
  'id,tipo,titulo-es,titulo-en,descripcion-es,descripcion-en,atributos,trasera\n' +
  'C01,carta,Mi primera carta,My first card,Texto de reglas.,Rules text.,,\n';
