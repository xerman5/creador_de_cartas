import type { FileSource } from '../core/assets';
import { downloadBlob } from '../core/export';
import { loadProject, PROJECT_FILE, serializeProject, type LoadedProject } from '../core/project';
import { detectLangs, serializeCsv } from '../core/csv';
import type { CardRow, Project } from '../core/types';
import { resourcePath, type ResourceDir } from '../core/wizard/resources';
import { WIZARD_FILE } from '../core/wizard/sync';

const HISTORY_LIMIT = 200;
/** Cambios seguidos sobre el mismo campo en este intervalo cuentan como un solo paso de deshacer. */
const COALESCE_MS = 1500;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Lo que se puede deshacer: el proyecto y la tabla de cartas. */
interface Snapshot {
  project: Project;
  rows: CardRow[];
  columns: string[];
}

/**
 * Estado compartido de la aplicación. El proyecto y las filas son inmutables: cada edición crea
 * una copia nueva, lo que da deshacer/rehacer gratis y hace que la vista se redibuje.
 */
export class Workspace {
  lp = $state.raw<LoadedProject | null>(null);
  source = $state.raw<FileSource | null>(null);
  /** Archivos de la carpeta de recursos, para sugerir rutas. */
  assetFiles = $state.raw<string[]>([]);
  lang = $state('');
  dirty = $state(false);
  loading = $state(false);
  error = $state('');
  canUndo = $state(false);
  canRedo = $state(false);
  /** El proyecto se hizo con el asistente (tiene asistente.json): se puede retomar. */
  hasWizard = $state(false);

  #undo: Snapshot[] = [];
  #redo: Snapshot[] = [];
  /** Filas tal como están en el disco: si cambian, al guardar se escribe también el CSV. */
  #savedRows: CardRow[] | null = null;
  #savedColumns: string[] | null = null;
  #lastKey = '';
  #lastTime = 0;

  get project(): Project | null {
    return this.lp?.project ?? null;
  }

  /** Con `fresh`, se relee todo aunque sea la misma carpeta y se empieza un historial nuevo. */
  async open(src: FileSource, fresh = false): Promise<boolean> {
    this.loading = true;
    this.error = '';
    try {
      const same = src === this.source && !fresh;
      // Al recargar la misma carpeta con cambios sin guardar se conserva el proyecto editado.
      const next = await loadProject(src, same && this.dirty ? (this.lp?.project ?? undefined) : undefined);
      const old = this.lp;
      this.lp = next;
      this.source = src;
      if (!same) {
        this.#undo = [];
        this.#redo = [];
        this.dirty = false;
        this.#syncHistory();
      }
      if (!next.langs.includes(this.lang)) this.lang = next.langs.includes('es') ? 'es' : (next.langs[0] ?? '');
      this.assetFiles = (await src.list?.(next.project.assetsDir)) ?? [];
      this.hasWizard = !!(await src.read(WIZARD_FILE));
      this.#savedRows = next.rows;
      this.#savedColumns = next.columns;
      setTimeout(() => old?.assets.dispose(), 5000);
      return true;
    } catch (e) {
      this.error = message(e);
      return false;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Aplica `fn` sobre una copia del proyecto.
   * - `coalesce`: ediciones seguidas con la misma clave se deshacen de una vez (teclear en un campo).
   * - `live`: no crea paso de deshacer; se usa durante un arrastre después de `begin()`.
   */
  update(fn: (p: Project) => void, opts: { coalesce?: string; live?: boolean } = {}) {
    const lp = this.lp;
    if (!lp) return;
    const next = structuredClone(lp.project);
    fn(next);
    this.#change({ project: next, rows: lp.rows, columns: lp.columns }, opts);
  }

  /**
   * Cambia la tabla de cartas. `fn` recibe copias de las filas y las columnas y las modifica;
   * las filas que no toca siguen siendo las mismas (se guarda solo lo que cambia).
   */
  updateRows(fn: (rows: CardRow[], columns: string[]) => void, opts: { coalesce?: string } = {}) {
    const lp = this.lp;
    if (!lp) return;
    const rows = [...lp.rows];
    const columns = [...lp.columns];
    fn(rows, columns);
    this.#change({ project: lp.project, rows, columns }, opts);
  }

  /** ¿Hay cambios en la tabla sin guardar? */
  get rowsDirty(): boolean {
    return !!this.lp && (this.lp.rows !== this.#savedRows || this.lp.columns !== this.#savedColumns);
  }

  #change(next: Snapshot, opts: { coalesce?: string; live?: boolean }) {
    const now = performance.now();
    const merge = opts.live || (!!opts.coalesce && opts.coalesce === this.#lastKey && now - this.#lastTime < COALESCE_MS);
    if (!merge) this.#push(this.#snapshot()!);
    this.#lastKey = opts.coalesce ?? '';
    this.#lastTime = now;
    this.#set(next);
  }

  #snapshot(): Snapshot | null {
    const lp = this.lp;
    return lp ? { project: lp.project, rows: lp.rows, columns: lp.columns } : null;
  }

  /** Guarda el estado actual como paso de deshacer antes de una serie de cambios `live`. */
  begin() {
    const snap = this.#snapshot();
    if (snap) this.#push(snap);
    this.#lastKey = '';
  }

  undo() {
    const prev = this.#undo.pop();
    const cur = this.#snapshot();
    if (!prev || !cur) return;
    this.#redo.push(cur);
    this.#lastKey = '';
    this.#set(prev);
  }

  redo() {
    const next = this.#redo.pop();
    const cur = this.#snapshot();
    if (!next || !cur) return;
    this.#undo.push(cur);
    this.#lastKey = '';
    this.#set(next);
  }

  /** Escribe proyecto.json (y el CSV si la tabla cambió) en la carpeta o, si no se puede, los descarga. */
  async save() {
    const lp = this.lp;
    if (!lp) return;
    try {
      const text = serializeProject(lp.project);
      const csv = this.rowsDirty ? serializeCsv(lp.rows, lp.columns, lp.csvFormat) : null;
      if (this.source?.write) {
        await this.source.write(PROJECT_FILE, text);
        if (csv !== null) await this.source.write(lp.project.csv, csv);
      } else {
        downloadBlob(new Blob([text], { type: 'application/json' }), PROJECT_FILE);
        if (csv !== null) downloadBlob(new Blob([csv], { type: 'text/csv' }), lp.project.csv.split('/').pop() || 'cartas.csv');
      }
      this.#savedRows = lp.rows;
      this.#savedColumns = lp.columns;
      this.dirty = false;
    } catch (e) {
      this.error = `No se pudo guardar: ${message(e)}`;
    }
  }

  /** Copia un archivo a la carpeta de recursos y devuelve su ruta relativa a ella. */
  async importAsset(file: File, subdir: string): Promise<string | null> {
    const lp = this.lp;
    if (!lp || !this.source?.write) return null;
    const rel = [subdir, file.name].filter(Boolean).join('/');
    try {
      await this.source.write(`${lp.project.assetsDir}/${rel}`, file);
      lp.assets.forget(rel);
      this.assetFiles = (await this.source.list?.(lp.project.assetsDir)) ?? this.assetFiles;
      return rel;
    } catch (e) {
      this.error = `No se pudo copiar la imagen: ${message(e)}`;
      return null;
    }
  }

  /** Añade archivos a un estante de la biblioteca sin pisar los que ya hay; devuelve sus rutas. */
  async addResources(files: File[], shelf: ResourceDir): Promise<string[]> {
    const lp = this.lp;
    if (!lp || !this.source?.write) return [];
    const taken = new Set(this.assetFiles);
    const paths: string[] = [];
    try {
      for (const f of files) {
        const path = resourcePath(shelf, f.name, (p) => taken.has(p));
        taken.add(path);
        await this.source.write(`${lp.project.assetsDir}/${path}`, f);
        lp.assets.forget(path);
        paths.push(path);
      }
    } catch (e) {
      this.error = `No se pudo copiar la imagen: ${message(e)}`;
    }
    await this.refreshAssets();
    return paths;
  }

  /** Borra un archivo de la carpeta de recursos. */
  async removeAsset(path: string) {
    const lp = this.lp;
    if (!lp || !this.source?.remove) return;
    try {
      await this.source.remove(`${lp.project.assetsDir}/${path}`);
      lp.assets.forget(path);
    } catch (e) {
      this.error = `No se pudo borrar: ${message(e)}`;
    }
    await this.refreshAssets();
  }

  async refreshAssets() {
    const lp = this.lp;
    if (lp && this.source?.list) this.assetFiles = await this.source.list(lp.project.assetsDir);
  }

  #push(p: Snapshot) {
    this.#undo.push(p);
    if (this.#undo.length > HISTORY_LIMIT) this.#undo.shift();
    this.#redo = [];
  }

  #set(snap: Snapshot) {
    const lp = this.lp!;
    const next = snap.project;
    const fontsChanged = JSON.stringify(lp.project.fonts) !== JSON.stringify(next.fonts);
    const langs = snap.columns === lp.columns ? lp.langs : detectLangs(snap.columns);
    this.lp = { ...lp, project: next, rows: snap.rows, columns: snap.columns, langs };
    this.dirty = true;
    this.#syncHistory();
    if (fontsChanged) {
      // Cuando las fuentes terminan de cargar se fuerza un redibujado.
      lp.assets.loadFonts(next.fonts).then((errors) => {
        if (this.lp?.project === next) this.lp = { ...this.lp, errors: [...this.lp.errors, ...errors] };
      });
    }
  }

  #syncHistory() {
    this.canUndo = this.#undo.length > 0;
    this.canRedo = this.#redo.length > 0;
  }
}
