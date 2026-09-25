<script lang="ts">
  import { FONT_FILE, fontFamilyOf, RESOURCE_FILE, shelfOf, SHELVES, type ShelfId } from '../core/wizard/resources';
  import { columnInfo, imagesByName, nextId } from '../core/table';
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

  // ---------------------------------------------------------- asignar por nombre

  /** Columna de la tabla con la ilustración de cada carta (la primera que usa una zona de imagen). */
  const imageColumn = $derived.by(() => {
    const lp = ws.lp;
    if (!lp) return '';
    const info = columnInfo(lp.project, lp.columns);
    return lp.columns.find((c) => c === 'ilustracion' && info[c]?.image) ?? lp.columns.find((c) => info[c]?.image) ?? '';
  });
  let growOffer = $state<{ tipo: string; have: number; want: number }[]>([]);

  function assignByName() {
    const lp = ws.lp;
    if (!lp || !imageColumn) return;
    const paths = images.filter((p) => shelfOf(p) === 'ilustraciones');
    const r = imagesByName(lp.rows, imageColumn, paths);
    if (r.assigned.size)
      ws.updateRows((rows) => {
        for (const [i, path] of r.assigned) rows[i] = { ...rows[i], [imageColumn]: path };
      });
    growOffer = r.grow;
    report = r.assigned.size
      ? `${r.assigned.size} ${r.assigned.size === 1 ? 'ilustración asignada' : 'ilustraciones asignadas'} por su nombre en la columna «${imageColumn}» (guarda para escribirlas en el CSV).`
      : 'Ninguna ilustración nueva que asignar: los nombres no coinciden con ninguna carta sin imagen.';
  }

  /** Cartas nuevas para las imágenes numeradas que no tienen carta: «lugar012.png» con 10 lugares. */
  function growRows(g: { tipo: string; have: number; want: number }) {
    ws.updateRows((rows, columns) => {
      let at = rows.map((r) => r.tipo).lastIndexOf(g.tipo) + 1;
      for (let n = g.have; n < g.want; n++) {
        const row = Object.fromEntries(columns.map((c) => [c, ''])) as Record<string, string>;
        row.id = nextId(rows, g.tipo);
        row.tipo = g.tipo;
        rows.splice(at++, 0, row);
      }
    });
    growOffer = growOffer.filter((x) => x !== g);
    assignByName();
  }

  // ---------------------------------------------------------- fuentes

  const fontFiles = $derived(ws.assetFiles.filter((f) => FONT_FILE.test(f)));
  const projectFonts = $derived(ws.lp?.project.fonts ?? []);
  let fontInput = $state<HTMLInputElement>();
  const shown = new Set<string>();

  // Cada fuente de la carpeta se carga en la página para enseñar su muestra.
  $effect(() => {
    const dir = ws.lp?.project.assetsDir;
    for (const path of fontFiles) {
      if (shown.has(path) || !ws.source || !dir) continue;
      shown.add(path);
      ws.source
        .read(`${dir}/${path}`)
        .then((blob) => blob?.arrayBuffer())
        .then((buf) => buf && new FontFace(`muestra:${path}`, buf).load())
        .then((face) => face && document.fonts.add(face))
        .catch(() => {});
    }
  });

  async function addFonts(files: File[]) {
    const fonts = files.filter((f) => FONT_FILE.test(f.name));
    const paths = await ws.addResources(fonts, 'fuentes');
    if (!paths.length) return;
    // El nombre de familia sale del nombre original del archivo, con sus mayúsculas.
    ws.update((p) => {
      paths.forEach((path, i) => {
        if (!p.fonts.some((f) => f.file === path)) p.fonts.push({ family: fontFamilyOf(fonts[i].name), file: path });
      });
    });
    report = `${paths.length} ${paths.length === 1 ? 'fuente añadida' : 'fuentes añadidas'} al proyecto: úsalas por su nombre en las zonas de texto.`;
  }

  function toggleFont(path: string, on: boolean) {
    ws.update((p) => {
      p.fonts = p.fonts.filter((f) => f.file !== path);
      if (on) p.fonts.push({ family: fontFamilyOf(path), file: path });
    });
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
      {#if shelf.id === 'ilustraciones' && list.length && imageColumn}
        <div class="row">
          <button class="small" onclick={assignByName}>Asignar por nombre</button>
          <span class="hint">
            A cada carta sin ilustración, la que se llama como su id (<code>lugar001.png</code>) o como su tipo y su número
            (<code>Lugar-3.jpg</code> es la tercera de Lugar).
          </span>
        </div>
        {#each growOffer as g}
          <p class="hint">
            «{g.tipo}» tiene imágenes hasta la {g.want} y {g.have} cartas.
            <button class="small" onclick={() => growRows(g)}>{g.want - g.have === 1 ? 'Crear la que falta' : `Crear las ${g.want - g.have} que faltan`}</button>
          </p>
        {/each}
      {/if}
      {#if list.some((it) => !used.has(it.path))}
        <p class="hint">Sin usar: {list.filter((it) => !used.has(it.path)).map((it) => it.path.split('/').pop()).join(', ')}</p>
      {/if}
    </section>
  {/each}

  <section>
    <h3>Fuentes <small>assets/fuentes/ · {fontFiles.length}</small></h3>
    <p class="hint">TTF, OTF o WOFF. Las que están «en el proyecto» se cargan al abrirlo y se usan por su nombre en las zonas de texto.</p>
    <div class="fonts">
      {#each fontFiles as path (path)}
        {@const pf = projectFonts.find((f) => f.file === path)}
        <div class="font">
          <span class="sample" style:font-family={`"muestra:${path}", sans-serif`}>Aa Bb 123</span>
          <span class="name">{pf?.family ?? fontFamilyOf(path)}</span>
          <label class="check"><input type="checkbox" checked={!!pf} disabled={!writable && !pf} onchange={(e) => toggleFont(path, e.currentTarget.checked)} /> En el proyecto</label>
          {#if writable}<button class="ghost small" onclick={() => remove(path)} aria-label="Borrar {path}">✕</button>{/if}
        </div>
      {:else}
        <p class="hint">Sin fuentes propias.</p>
      {/each}
      {#if writable}
        <button class="small" onclick={() => fontInput?.click()}>＋ Añadir fuentes…</button>
        <input
          type="file"
          hidden
          multiple
          accept=".ttf,.otf,.woff,.woff2"
          bind:this={fontInput}
          onchange={(e) => {
            const files = [...(e.currentTarget.files ?? [])];
            e.currentTarget.value = '';
            addFonts(files);
          }}
        />
      {/if}
    </div>
  </section>

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
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 6px;
  }
  .fonts {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  .font {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .sample {
    font-size: 22px;
    min-width: 150px;
  }
  .name {
    min-width: 140px;
    color: var(--muted);
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 13px;
  }
  button.small {
    padding: 2px 10px;
    font-size: 12px;
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
