<script lang="ts">
  import { RESOURCE_FILE, shelfOf, SHELVES, type ShelfId } from '../core/wizard/resources';
  import ResourceShelf from './ResourceShelf.svelte';
  import { thumbUrls } from './thumbs.svelte';
  import type { Workspace } from './workspace.svelte';

  /** Biblioteca del proyecto: iconos, fondos e ilustraciones en sus carpetas de assets/. */
  let { ws }: { ws: Workspace } = $props();

  const images = $derived(ws.assetFiles.filter((f) => RESOURCE_FILE.test(f)));
  const assets = $derived(ws.lp?.assets);
  const thumbs = thumbUrls(() => ({ assets, paths: images }));
  const writable = $derived(!!ws.source?.write);
  let report = $state('');

  /** Rutas que usa el proyecto: iconos del catálogo, imágenes de las plantillas y celdas del CSV. */
  const used = $derived.by(() => {
    const out = new Set<string>();
    const lp = ws.lp;
    if (!lp) return out;
    const add = (p: string | undefined) => p && out.add(p.replace(/\\/g, '/').replace(/^\.?\/+/, ''));
    for (const d of Object.values(lp.project.attributes)) add(d.icon);
    for (const t of Object.values(lp.project.templates))
      for (const z of t.zones) {
        if (z.type === 'image') add(z.default);
        if (z.type === 'attribute') add(z.icon);
      }
    const inCell = /[^\s|@;,"']+\.(?:png|jpe?g|webp|gif|svg)/gi;
    for (const r of lp.rows) for (const v of Object.values(r)) for (const m of v.matchAll(inCell)) add(m[0]);
    return out;
  });

  const items = (shelf: ShelfId | null) =>
    images
      .filter((p) => shelfOf(p) === shelf)
      .map((path) => ({ path, url: thumbs.urls.get(path) ?? '' }))
      .filter((it) => it.url);
  const others = $derived(items(null));

  async function add(files: File[], shelf: ShelfId) {
    const paths = await ws.addResources(files, shelf);
    report = paths.length ? `${paths.length} ${paths.length === 1 ? 'archivo añadido' : 'archivos añadidos'} a assets/${shelf}/.` : '';
  }

  async function remove(path: string) {
    const msg = used.has(path)
      ? `«${path}» se usa en el proyecto: las cartas que lo usan se quedarán sin imagen. ¿Borrarlo de la carpeta?`
      : `¿Borrar «${path}» de la carpeta del proyecto?`;
    if (confirm(msg)) await ws.removeAsset(path);
  }
</script>

<div class="resources">
  <header>
    <h2>Recursos</h2>
    <p class="lead">
      Las imágenes del proyecto, por estantes. Suelta archivos o carpetas enteras en cada estante; después, arrastra una miniatura
      a un hueco de imagen (el icono de un atributo, la imagen de una zona) o elígela con un clic desde ese hueco.
    </p>
    {#if !writable}
      <p class="warn">
        Este proyecto no está abierto desde una carpeta con permiso de escritura: puedes ver los recursos pero no añadir ni borrar.
        Ábrelo con «Abrir…» en Chrome o Edge.
      </p>
    {/if}
    {#if report}<div class="report">{report} <button class="ghost small" onclick={() => (report = '')}>✕</button></div>{/if}
  </header>

  {#each SHELVES as shelf}
    {@const list = items(shelf.id)}
    <section>
      <h3>{shelf.label} <small>assets/{shelf.id}/ · {list.length}</small></h3>
      <p class="hint">{shelf.hint}</p>
      <ResourceShelf
        items={list}
        onadd={writable ? (files) => add(files, shelf.id) : undefined}
        onremove={writable ? remove : undefined}
        empty={writable ? 'Vacío: suelta aquí tus archivos.' : 'Vacío.'}
      />
      {#if list.some((it) => !used.has(it.path))}
        <p class="hint">Sin usar: {list.filter((it) => !used.has(it.path)).map((it) => it.path.split('/').pop()).join(', ')}</p>
      {/if}
    </section>
  {/each}

  {#if others.length}
    <section>
      <h3>Otros <small>{others.length}</small></h3>
      <p class="hint">Imágenes fuera de los estantes (por ejemplo, las provisionales del asistente).</p>
      <ResourceShelf items={others} onremove={writable ? remove : undefined} compact />
    </section>
  {/if}
</div>

<style>
  .resources {
    height: 100%;
    overflow: auto;
    padding: 20px 28px 40px;
    max-width: 1100px;
    margin: 0 auto;
  }
  h2 {
    margin: 0 0 6px;
  }
  h3 {
    margin: 22px 0 2px;
    font-size: 15px;
  }
  h3 small {
    font-weight: normal;
    color: var(--muted);
    margin-left: 6px;
  }
  .lead {
    color: var(--muted);
    max-width: 760px;
  }
  .hint {
    color: var(--muted);
    font-size: 12px;
    margin: 2px 0 8px;
  }
  .warn {
    color: var(--warn);
  }
  .report {
    background: #1d3355;
    color: #d7e6ff;
    border-radius: 6px;
    padding: 6px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 760px;
  }
</style>
