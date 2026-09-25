import Papa from 'papaparse';
import { layoutZones, artPath } from './designs';
import { artSvg, backSvg, costSvg, iconSvg, shiftColor } from './art';
import {
  attrKey,
  fileKey,
  flagOn,
  FONT_PAIRS,
  fontStack,
  mergeFine,
  resolvedType,
  textKey,
  typeKey,
  type CardData,
  type CardImages,
  type ElementKey,
  type FineTune,
  type WizardAnswers,
} from './answers';
import { DEFAULT_SAFE_MM } from '../card';
import { conventionalId } from '../naming';
import { PROJECT_FILE, serializeProject } from '../project';
import { normalizeKey } from '../text';
import type { AttributeDef, CardSize, Project, Template, Zone } from '../types';

/** Textos de relleno: el panel de pendientes los reconoce para avisar de lo que falta escribir. */
export const PLACEHOLDERS: Record<string, { rules: string; flavor: string }> = {
  es: { rules: 'Escribe aquí el texto de reglas.', flavor: 'Una frase de ambientación.' },
  en: { rules: 'Write the rules text here.', flavor: 'A line of flavor text.' },
  fr: { rules: 'Écrivez ici le texte des règles.', flavor: "Une phrase d'ambiance." },
  de: { rules: 'Schreibe hier den Regeltext.', flavor: 'Ein stimmungsvoller Satz.' },
  it: { rules: 'Scrivi qui il testo delle regole.', flavor: 'Una frase di ambientazione.' },
  pt: { rules: 'Escreva aqui o texto das regras.', flavor: 'Uma frase de ambientação.' },
};

export const PROVISIONAL_DIR = 'provisional/';
export const BACK_TEMPLATE = 'trasera';
export const MAX_ROWS_PER_TYPE = 500;

export interface BuiltProject {
  project: Project;
  csv: string;
  /** Archivos del proyecto (rutas desde la raíz), además de proyecto.json y el CSV. */
  files: Record<string, string>;
}

const COST_KEY = 'coste';

/** Forma del icono provisional: fija para cada nombre, para que reordenar no la cambie. */
const KNOWN_SHAPES: Record<string, number> = { ataque: 0, fuerza: 0, dano: 0, vida: 2, salud: 2, defensa: 3, escudo: 3, armadura: 3, magia: 4, poder: 4, velocidad: 1 };
function shapeIndex(key: string): number {
  return KNOWN_SHAPES[key] ?? [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 8;
}

/** Icono provisional de un atributo (el que se usa si no se sube uno propio). */
export const provisionalIcon = (key: string, color: string, ink: string) => iconSvg(shapeIndex(key), color, ink);
export { costSvg };

/** Todos los archivos del proyecto, listos para escribir en una carpeta o en un zip. */
export function projectFiles(built: BuiltProject): Record<string, string> {
  return { [PROJECT_FILE]: serializeProject(built.project), [built.project.csv]: built.csv, ...built.files };
}

/** Id por defecto de la carta `k` (desde 1) de cada tipo, con la convención tipo + número: «lugar001». */
export function cardIds(types: { label: string }[]): ((k: number) => string)[] {
  return types.map((t) => (k: number) => conventionalId(t.label, k));
}

function backTemplate(answers: WizardAnswers, f: number): Template {
  const { width: W, height: H } = answers.size;
  const m = DEFAULT_SAFE_MM + 0.5;
  const bandH = Math.min(24 * f, H * 0.3);
  const y = (H - bandH) / 2;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const zones: Zone[] = [
    { id: 'dibujo', type: 'image', default: `${PROVISIONAL_DIR}trasera.svg`, fit: 'cover', bleed: true, locked: true, rect: { x: 0, y: 0, w: W, h: H } },
    {
      id: 'banda',
      type: 'shape',
      fill: 'papel',
      ...(answers.backs === 'per-type' ? { fillBind: 'color' } : {}),
      stroke: 'acento',
      strokeWidth: r2(0.6 * f),
      radius: answers.adjust.rounded ? r2(2 * f) : 0,
      rect: { x: r2(m), y: r2(y), w: r2(W - 2 * m), h: r2(bandH) },
    },
    {
      id: 'nombre',
      type: 'text',
      bind: 'titulo',
      default: answers.name,
      align: 'center',
      valign: 'middle',
      padding: r2(2 * f),
      minSize: r2(7 * f),
      font: { family: fontStack(answers).title, size: r2(16 * f), weight: 'bold', color: 'principal' },
      rect: { x: r2(m), y: r2(y), w: r2(W - 2 * m), h: r2(bandH * (answers.backs === 'per-type' ? 0.66 : 1)) },
    },
  ];
  if (answers.backs === 'per-type') {
    zones.push({
      id: 'tipo',
      type: 'text',
      bind: 'subtipo',
      align: 'center',
      valign: 'top',
      font: { family: fontStack(answers).body, size: r2(8 * f), color: 'tinta', style: 'italic' },
      rect: { x: r2(m), y: r2(y + bandH * 0.6), w: r2(W - 2 * m), h: r2(bandH * 0.36) },
    });
  }
  // Ajustes del paso «Traseras»: otro dibujo, la banda y los textos.
  const back = answers.backFine;
  const out = applyFine(zones, back ? mergeFine({ pieces: {}, texts: {} }, back) : undefined, f, fontStack(answers));
  const art = out.find((z) => z.id === 'dibujo');
  if (art?.type === 'image' && back?.images?.background) art.default = back.images.background;
  return { zones: out };
}

const isContent = (z: Zone) => z.type === 'text' || z.type === 'attribute' || z.type === 'attributes';

/**
 * Fondo (debajo de todo) y marco (encima de ilustración y formas, debajo de textos e iconos) de la carta.
 * Con marco, el contenido pasa a dibujarse después de todas las formas; nunca estaba debajo de ninguna.
 */
export function withCardImages(zones: Zone[], images: CardImages | undefined, size: Pick<CardSize, 'width' | 'height'>): Zone[] {
  const full = { x: 0, y: 0, w: size.width, h: size.height };
  let out = zones;
  if (images?.background) {
    const bg: Zone = { id: 'fondo imagen', type: 'image', default: images.background, fit: 'cover', bleed: true, locked: true, rect: full };
    const at = out.findIndex((z) => z.id === 'fondo') + 1;
    out = [...out.slice(0, at), bg, ...out.slice(at)];
  }
  if (images?.frame) {
    const frame: Zone = { id: 'marco imagen', type: 'image', default: images.frame, fit: 'stretch', bleed: true, locked: true, rect: full };
    out = [...out.filter((z) => !isContent(z)), frame, ...out.filter(isContent)];
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Aplica el ajuste fino (colores, transparencia, bordes, letra, iconos) por id de zona. */
export function applyFine(zones: Zone[], fine: FineTune | undefined, f: number, fonts: { title: string; body: string } = FONT_PAIRS.clasica): Zone[] {
  if (!fine) return zones;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return zones.map((z) => {
    const ic = fine.icons?.[z.id];
    if (z.type === 'attributes' && ic) {
      const out = { ...z };
      if (ic.scale !== undefined) {
        out.iconSize = r2(z.iconSize * clamp(ic.scale, 0.5, 1));
        out.font = { ...z.font, size: r2(z.font.size * clamp(ic.scale, 0.5, 1)) };
      }
      if (ic.value) out.valuePosition = ic.value;
      if (ic.labels !== undefined) out.labels = ic.labels;
      if (ic.backdrop) {
        out.backdrop = ic.backdrop === 'none' ? undefined : ic.backdrop;
        // El texto junto al icono tiene que leerse sobre su fondo; sin fondo, blanco con contorno.
        const ink = { tinta: 'papel', principal: 'papel', papel: 'tinta', acento: 'tinta' }[ic.backdrop as string];
        out.font = ink
          ? { ...out.font, color: ink, strokeColor: undefined, strokeWidth: undefined }
          : { ...out.font, color: '#ffffff', strokeColor: '#000000', strokeWidth: r2(0.35 * f) };
      }
      if (ic.align) out.align = ic.align;
      return out;
    }
    if (z.type === 'attribute' && ic?.scale !== undefined) {
      // Se encoge hacia su centro: nunca sale de donde estaba.
      const k = clamp(ic.scale, 0.5, 1);
      const w = z.rect.w * k;
      const h = z.rect.h * k;
      const rect = { x: r2(z.rect.x + (z.rect.w - w) / 2), y: r2(z.rect.y + (z.rect.h - h) / 2), w: r2(w), h: r2(h) };
      return { ...z, rect, font: { ...z.font, size: r2(z.font.size * k) } };
    }
    if (z.type === 'shape' && ic?.scale !== undefined && !fine.pieces[z.id]) {
      const k = clamp(ic.scale, 0.5, 1);
      const w = z.rect.w * k;
      const h = z.rect.h * k;
      return { ...z, rect: { x: r2(z.rect.x + (z.rect.w - w) / 2), y: r2(z.rect.y + (z.rect.h - h) / 2), w: r2(w), h: r2(h) } };
    }
    if (z.type === 'shape' && fine.pieces[z.id]) {
      const p = fine.pieces[z.id];
      const out = { ...z };
      if (p.fill) out.fill = p.fill === 'none' ? undefined : p.fill;
      if (p.opacity !== undefined) out.opacity = Math.min(1, Math.max(0, p.opacity));
      if (p.border === true) {
        out.stroke ??= 'acento';
        out.strokeWidth ??= Math.round(0.35 * f * 100) / 100;
      } else if (p.border === false) out.stroke = undefined;
      return out;
    }
    if (z.type === 'text' && fine.texts[z.id]) {
      const t = fine.texts[z.id];
      const scale = clamp(t.scale ?? 1, 0.7, 1.5);
      const font = { ...z.font, size: r2(z.font.size * scale) };
      if (t.color) font.color = t.color;
      if (t.font) font.family = t.font === 'title' ? fonts.title : t.font === 'body' ? fonts.body : `"${t.font}", ${fonts.body}`;
      if (t.bold !== undefined) font.weight = t.bold ? 'bold' : 'normal';
      if (t.italic !== undefined) font.style = t.italic ? 'italic' : 'normal';
      return {
        ...z,
        minSize: z.minSize !== undefined ? r2(z.minSize * scale) : undefined,
        font,
        ...(t.align ? { align: t.align } : {}),
      };
    }
    return z;
  });
}

/** De las respuestas del asistente a un proyecto completo que ya se puede ver y exportar. */
export function buildProject(answers: WizardAnswers): BuiltProject {
  const a = answers;
  const size = { width: a.size.width, height: a.size.height, safe: DEFAULT_SAFE_MM };
  const f = Math.min(size.width / 63, size.height / 88);
  const langs = a.langs.length ? a.langs : ['es'];
  const col = (name: string, lang: string) => textKey(name, lang, langs);
  const types = a.types.filter((t) => t.label.trim());
  const variantCol = normalizeKey(a.variant.column || 'rareza');
  const palette = a.adjust.palette;
  const files: Record<string, string> = {};

  const resolved = types.map((t) => resolvedType(a, t));
  const usesCost = resolved.some((r) => r.elements.has('cost'));
  const usesVariant = resolved.some((r) => r.elements.has('variant'));
  const any = (e: ElementKey) => resolved.some((r) => r.elements.has(e));

  // Catálogo de atributos con iconos provisionales.
  const attributes: Record<string, AttributeDef> = {};
  // Solo si alguna carta los muestra: los atributos de ejemplo no deben ensuciar el proyecto.
  if (any('stats')) a.attributes.forEach((at) => {
    const key = attrKey(at);
    if (!key || attributes[key]) return;
    // El icono propio lo aporta quien llama (los archivos subidos); si no, uno provisional de su color.
    let icon = at.icon?.trim();
    if (!icon) {
      icon = `${PROVISIONAL_DIR}iconos/${fileKey(key)}.svg`;
      files[`assets/${icon}`] = iconSvg(shapeIndex(key), at.color, palette.tinta);
    }
    attributes[key] = { icon, label: at.label.trim() };
  });
  if (usesCost && !attributes[COST_KEY]) {
    let icon = a.costIcon?.trim();
    if (!icon) {
      icon = `${PROVISIONAL_DIR}iconos/coste.svg`;
      files[`assets/${icon}`] = costSvg(palette);
    }
    attributes[COST_KEY] = { icon, label: 'Coste' };
  }

  const colors: Record<string, string> = { ...palette };
  if (usesVariant) for (const v of a.variant.values) if (v.name.trim()) colors[normalizeKey(v.name)] = v.color;

  // Plantillas e ilustraciones provisionales.
  const templates: Record<string, Template> = {};
  const backIds = new Map<string, string>();
  types.forEach((t, i) => {
    const key = typeKey(t);
    const r = resolved[i];
    const fine = mergeFine(a.fine, t.fine);
    const zones = withCardImages(
      applyFine(
        layoutZones({
          design: a.design,
          elements: r.elements,
          size,
          adjust: { ...a.adjust, ...fine.layout },
          tipo: key,
          statKeys: r.stats,
          abilityKeys: r.abilities,
          variantColumn: variantCol,
        }),
        fine,
        f,
        fontStack(a),
      ),
      fine.images,
      size,
    );
    const art = zones.find((z) => z.id === 'ilustracion');
    if (art) files[`assets/${artPath(key)}`] = artSvg(art.rect.w, art.rect.h, palette, i * 47, `${t.label} · ilustración provisional`);
    const tpl: Template = { zones };
    if (a.backs !== 'none') {
      const backId = a.backs === 'common' ? 'trasera' : `trasera-${conventionalId(t.label, 1).replace(/\d+$/, '')}`;
      tpl.back = backId;
      backIds.set(key, backId);
    }
    templates[key] = tpl;
  });
  if (a.backs !== 'none') {
    templates[BACK_TEMPLATE] = backTemplate(a, f);
    files[`assets/${PROVISIONAL_DIR}trasera.svg`] = backSvg(palette, size.width, size.height);
  }

  const project: Project = {
    name: a.name.trim() || 'Mi juego',
    csv: 'cartas.csv',
    assetsDir: 'assets',
    card: size,
    fonts: (a.fonts ?? []).filter((x) => x.family.trim() && x.file.trim()).map((x) => ({ family: x.family.trim(), file: x.file })),
    attributes,
    templates,
    colors,
    export: { dpi: 300, format: 'png', quality: 95 },
  };

  // CSV con las columnas exactas y filas de ejemplo.
  const fields = ['id', 'tipo', ...langs.map((l) => col('titulo', l))];
  if (any('subtitle')) fields.push(...langs.map((l) => col('subtipo', l)));
  if (any('rules')) fields.push(...langs.map((l) => col('descripcion', l)));
  if (any('flavor')) fields.push(...langs.map((l) => col('sabor', l)));
  if (usesCost || any('stats')) fields.push('atributos');
  if (usesVariant) fields.push(variantCol);
  if (any('art')) fields.push('ilustracion', 'encuadre');
  if (any('number')) fields.push('numero');
  fields.push('copias');
  if (a.backs === 'per-type') fields.push('color');

  const ids = cardIds(types);
  const total = types.reduce((s, t) => s + Math.min(MAX_ROWS_PER_TYPE, Math.max(0, Math.round(t.count))), 0);
  const width = String(total).length < 3 ? 3 : String(total).length;
  const rows: Record<string, string>[] = [];
  let serial = 0;
  types.forEach((t, i) => {
    const r = resolved[i];
    const n = Math.min(MAX_ROWS_PER_TYPE, Math.max(0, Math.round(t.count)));
    const firstStat = r.attributes[0];
    for (let k = 1; k <= n; k++) {
      serial++;
      // Lo que el usuario escribió manda; lo vacío se rellena con ejemplos (y queda como pendiente).
      const data: CardData = t.cards?.[k - 1] ?? {};
      const own = (key: string) => (data[key] ?? '').trim();
      // Una carta sin nada escrito lleva habilidades de ejemplo; en cuanto se rellena, solo las marcadas.
      const untouched = !Object.entries(data).some(([key, v]) => !['id', 'ilustracion', 'copias'].includes(key) && v.trim());
      const row: Record<string, string> = { id: own('id') || ids[i](k), tipo: t.label.trim() };
      for (const l of langs) {
        const ph = PLACEHOLDERS[l] ?? PLACEHOLDERS.es;
        row[col('titulo', l)] = own(col('titulo', l)) || `${t.label.trim()} ${k}`;
        if (r.elements.has('subtitle')) row[col('subtipo', l)] = own(col('subtipo', l)) || t.label.trim();
        if (r.elements.has('rules'))
          row[col('descripcion', l)] = own(col('descripcion', l)) || (firstStat && k === 1 ? `${ph.rules} {${firstStat}}` : ph.rules);
        if (r.elements.has('flavor')) row[col('sabor', l)] = own(col('sabor', l)) || ph.flavor;
      }
      const attrs: string[] = [];
      if (r.elements.has('cost')) attrs.push(`${COST_KEY}:${own('coste') || ((k - 1) % 5) + 1}`);
      if (r.elements.has('stats')) {
        r.stats.forEach((key, j) => attrs.push(`${key}:${own(`attr:${key}`) || ((k + j * 2) % 6) + 1}`));
        r.abilities.forEach((key, j) => {
          if (untouched ? (k + j) % 2 === 1 : flagOn(own(`attr:${key}`))) attrs.push(key);
        });
      }
      if (attrs.length) row.atributos = attrs.join(' | ');
      if (r.elements.has('variant') && a.variant.values.length)
        row[variantCol] = own('variante') || a.variant.values[(k - 1) % a.variant.values.length].name;
      if (r.elements.has('art') && own('ilustracion')) row.ilustracion = own('ilustracion');
      if (r.elements.has('art') && own('encuadre')) row.encuadre = own('encuadre');
      if (own('copias')) row.copias = own('copias');
      if (r.elements.has('number')) row.numero = `${String(serial).padStart(width, '0')}/${String(total).padStart(width, '0')}`;
      rows.push(row);
    }
  });
  if (a.backs === 'common') rows.push({ id: 'trasera', tipo: BACK_TEMPLATE, [col('titulo', langs[0])]: a.name.trim() });
  if (a.backs === 'per-type') {
    types.forEach((t, i) => {
      const row: Record<string, string> = { id: backIds.get(typeKey(t))!, tipo: BACK_TEMPLATE, color: shiftColor(palette.acento, i * 67, 0.28) };
      for (const l of langs) {
        row[col('titulo', l)] = a.name.trim();
        row[col('subtipo', l)] = t.label.trim();
      }
      rows.push(row);
    });
    for (const l of langs) if (!fields.includes(col('subtipo', l))) fields.push(col('subtipo', l));
  }

  const csv = Papa.unparse({ fields, data: rows.map((r) => fields.map((c) => r[c] ?? '')) }, { newline: '\n' }) + '\n';
  return { project, csv, files };
}
