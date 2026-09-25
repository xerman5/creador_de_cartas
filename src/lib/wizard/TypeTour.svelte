<script lang="ts">
  import { cardPixels } from '../../core/card';
  import type { Zone } from '../../core/types';
  import {
    attrKey,
    ELEMENTS as CONTENT,
    fontStack,
    hasElement,
    isAbility,
    typeLabel,
    mergeFine,
    setElement,
    type FineTune,
    type IconStyle,
    type PieceColor,
    type PieceStyle,
    type ElementKey,
    type TextStyle,
    type WizardAnswers,
  } from '../../core/wizard/answers';
  import ResourceShelf from '../ResourceShelf.svelte';
  import ResourceSlot from '../ResourceSlot.svelte';
  import PieceControls from '../panels/PieceControls.svelte';
  import Swatches from '../panels/Swatches.svelte';
  import TextControls from '../panels/TextControls.svelte';
  import { clearOwn, contentType, ELEMENT_OF, fineFor, hasOwn, type Library, type Scope, type TourElement } from './tour';

  let {
    answers = $bindable(),
    current,
    element,
    elements,
    zones,
    lib,
    iconUrl,
    costUrl,
    setIcon,
    ongo,
  }: {
    answers: WizardAnswers;
    /** Tipo que se recorre. */
    current: number;
    /** Elemento del recorrido (índice en `elements`). */
    element: number;
    elements: TourElement[];
    /** Zonas de la plantilla del tipo, tal como se dibujan ahora. */
    zones: Zone[];
    lib: Library;
    iconUrl: (at: WizardAnswers['attributes'][number]) => string | undefined;
    costUrl: string | undefined;
    setIcon: (target: number | 'coste', path: string | undefined) => void;
    /** Saltar a otro elemento o tipo. */
    ongo: (type: number, element: number) => void;
  } = $props();

  const t = $derived(answers.types[current]);
  const E = $derived(elements[Math.min(element, elements.length - 1)]);
  const many = $derived(answers.types.length > 1);
  let scope = $state<Scope>('all');
  const where = $derived<Scope>(many ? scope : 'all');

  /** Lo que se ve: el ajuste de todos más el de este tipo. */
  const eff = $derived(mergeFine(answers.fine, t?.fine));
  const layout = $derived({ ...answers.adjust, ...eff.layout });
  const has = (id: string) => zones.some((z) => z.id === id);
  const zone = (id: string) => zones.find((z) => z.id === id);
  const palette = $derived(answers.adjust.palette);


  // ---------------------------------------------------------- escribir en el ajuste que toca
  // Ojo: en un estado de Svelte, `a.b ??= {}` devuelve el objeto sin envolver; hay que volver a leerlo.

  const target = (): Partial<FineTune> => fineFor(answers, t, where);
  function piece(id: string): PieceStyle {
    const f = target();
    f.pieces ??= {};
    f.pieces[id] ??= {};
    return f.pieces[id];
  }
  function text(id: string): TextStyle {
    const f = target();
    f.texts ??= {};
    f.texts[id] ??= {};
    return f.texts[id];
  }
  function icon(id: string): IconStyle {
    const f = target();
    f.icons ??= {};
    f.icons[id] ??= {};
    return f.icons[id];
  }
  function setImage(which: 'background' | 'frame', path: string | undefined) {
    const f = target();
    f.images ??= {};
    const images = f.images;
    // En un tipo, «sin imagen» se guarda vacío para tapar la de todos.
    if (path) images[which] = path;
    else if (where === 'type') images[which] = '';
    else delete images[which];
    picking = null;
  }
  function setLayout<K extends 'art' | 'attrSide' | 'costCorner'>(key: K, v: WizardAnswers['adjust'][K]) {
    if (where === 'all') answers.adjust[key] = v;
    else {
      t.fine ??= {};
      t.fine.layout ??= {};
      t.fine.layout[key] = v;
    }
  }

  /** Vuelve a lo del diseño (o, en un tipo, a lo de todos) en este elemento. */
  function reset() {
    if (where === 'type') return clearOwn(t, E);
    for (const z of E.zones) {
      delete answers.fine.pieces[z];
      delete answers.fine.texts[z];
      delete answers.fine.icons?.[z];
    }
    if (E.id === 'fondo') answers.fine.images = {};
  }

  // ---------------------------------------------------------- recursos

  let picking = $state<'background' | 'frame' | number | 'coste' | null>(null);

  function pickIcon(target: number | 'coste') {
    picking = picking === target ? null : target;
  }

  const px = $derived(cardPixels({ width: answers.size.width, height: answers.size.height }, 300));
  const fonts = $derived(fontStack(answers));
  const customFonts = $derived((answers.fonts ?? []).map((f) => f.family));

  // ---------------------------------------------------------- contenido del tipo

  /** Tipo que decide el contenido (si este es «igual que» otro, el otro). */
  const src = $derived(contentType(answers, t));
  const missing = $derived(CONTENT.filter((e) => !hasElement(src, e.key)));

  function addElement(key: ElementKey) {
    setElement(src, key, true);
    if (key === 'stats' && !src.attributes.length) src.attributes = answers.attributes.map(attrKey).filter(Boolean);
  }
  function removeElement(key: ElementKey) {
    setElement(src, key, false);
  }
  function toggleAttr(key: string, on: boolean) {
    src.attributes = on ? [...src.attributes.filter((k) => k !== key), key] : src.attributes.filter((k) => k !== key);
  }
  function newAttr(kind: 'number' | 'icon') {
    const label = prompt(kind === 'icon' ? 'Nombre de la habilidad (p. ej. Volar):' : 'Nombre del atributo (p. ej. Defensa):')?.trim();
    if (!label) return;
    if (answers.attributes.some((at) => attrKey(at) === attrKey({ label })) || attrKey({ label }) === 'coste') return alert(`Ya existe «${label}».`);
    const colors = ['#d9534f', '#4caf50', '#3d8fe0', '#f0b429', '#a45bd6', '#26a69a', '#ef7d3c', '#8d6e63'];
    answers.attributes.push({ label, color: colors[answers.attributes.length % colors.length], kind });
    toggleAttr(attrKey({ label }), true);
  }
</script>

{#snippet swatches(value: string | undefined, label: string, onpick: (c: PieceColor) => void, none = true)}
  <Swatches {value} {label} {palette} {none} {onpick} />
{/snippet}

{#snippet pieceRow(id: string, label: string, fillable = true)}
  {@const z = zone(id)}
  {#if z && z.type === 'shape'}
    <PieceControls zone={z} style={eff.pieces[id] ?? {}} {label} {palette} {fillable} onchange={(p) => Object.assign(piece(id), p)} />
  {/if}
{/snippet}

{#snippet textRows(id: string, label: string)}
  {@const z = zone(id)}
  {#if z && z.type === 'text'}
    <TextControls zone={z} style={eff.texts[id] ?? {}} {label} {palette} {fonts} custom={customFonts} onchange={(p) => Object.assign(text(id), p)} />
  {/if}
{/snippet}

{#snippet iconShelf()}
  <ResourceShelf
    compact
    items={lib.items('iconos')}
    selected={typeof picking === 'number' ? (answers.attributes[picking]?.icon ?? '') : picking === 'coste' ? (answers.costIcon ?? '') : ''}
    onpick={typeof picking === 'number' || picking === 'coste' ? (p) => { setIcon(picking as number | 'coste', p); picking = null; } : undefined}
    onadd={(files) => {
      const paths = lib.add(files, 'iconos');
      if (typeof picking === 'number' || picking === 'coste') {
        setIcon(picking, paths[0]);
        picking = null;
      }
    }}
    onremove={lib.remove}
    empty="Sin iconos propios. Añade o suelta aquí los tuyos."
  />
  <p class="hint">
    {#if typeof picking === 'number' || picking === 'coste'}Elige el icono de <b>{picking === 'coste' ? 'Coste' : answers.attributes[picking]?.label}</b> o suelta uno nuevo.
    {:else}Haz clic en un icono de arriba para cambiarlo, o arrastra una miniatura encima. Los iconos valen para todos los tipos.{/if}
  </p>
{/snippet}

{#snippet attrEditor(kind: 'number' | 'icon')}
  <div class="attrs">
    <!-- Todos (con número y solo icono): al cambiar uno de clase no desaparece de la lista. -->
    {#each answers.attributes as at, i}
      {@const key = attrKey(at)}
      {#if key}
        <div class="attr">
          <label class="inline" title="¿Lo lleva «{typeLabel(t)}»?">
            <input type="checkbox" checked={src.attributes.includes(key)} onchange={(e) => toggleAttr(key, e.currentTarget.checked)} aria-label="«{typeLabel(t)}» lleva {at.label}" />
          </label>
          <ResourceSlot
            url={iconUrl(at)}
            label={at.label}
            custom={!!at.icon}
            active={picking === i}
            onclick={() => pickIcon(i)}
            onfile={(f) => setIcon(i, lib.add([f], 'iconos')[0])}
            onpath={(p) => setIcon(i, p)}
          />
          <span class="name" class:off={!src.attributes.includes(key)}>{at.label}</span>
          <div class="seg" role="group" aria-label="Clase de {at.label}">
            <button class:active={!isAbility(at)} onclick={() => (at.kind = 'number')} title="Un número que cambia en cada carta">Con número</button>
            <button class:active={isAbility(at)} onclick={() => (at.kind = 'icon')} title="La carta la tiene o no">Solo icono</button>
          </div>
        </div>
      {/if}
    {/each}
    <button class="small" onclick={() => newAttr(kind)}>＋ {kind === 'icon' ? 'Habilidad' : 'Atributo'}</button>
  </div>
  <p class="hint">
    Marca los que lleva «{typeLabel(t)}». Con número van en «Atributos»; solo icono, en «Habilidades» (una fila sobre la ilustración, y
    cada carta lleva las que marques en la tabla). La clase vale para todos los tipos.{#if src !== t} «{typeLabel(t)}» es igual que «{typeLabel(src)}»: los cambios valen para los dos.{/if}
  </p>
{/snippet}

{#if t && E}
  <div class="tour">
    <div class="head">
      <div class="where">
        <b>{typeLabel(t) || `Tipo ${current + 1}`}</b>
        {#if many}<small>tipo {current + 1} de {answers.types.length}</small>{/if}
        <small>· elemento {element + 1} de {elements.length}</small>
      </div>
      {#if many}
        <div class="scope">
          <span>Estos cambios valen para</span>
          <div class="seg" role="group" aria-label="A qué tipos se aplican los cambios">
            <button class:active={scope === 'all'} onclick={() => (scope = 'all')}>Todos los tipos</button>
            <button class:active={scope === 'type'} onclick={() => (scope = 'type')}>Solo «{typeLabel(t)}»</button>
          </div>
        </div>
      {/if}
    </div>

    <ol class="els" aria-label="Elementos de {typeLabel(t)}">
      {#each elements as e, i}
        <li>
          <button class:active={i === element} class:own={hasOwn(t, e)} onclick={() => ongo(current, i)} title={hasOwn(t, e) ? 'Con ajustes propios de este tipo' : undefined}>
            {e.label}
          </button>
        </li>
      {/each}
      {#if missing.length}
        <li>
          <select
            class="add"
            aria-label="Añadir un elemento a {typeLabel(t)}"
            value=""
            onchange={(e) => {
              const v = e.currentTarget.value as ElementKey;
              e.currentTarget.value = '';
              if (v) addElement(v);
            }}
          >
            <option value="">＋ Añadir…</option>
            {#each missing as m}<option value={m.key}>{m.label}</option>{/each}
          </select>
        </li>
      {/if}
    </ol>

    <section class="panel">
      <h3>{E.label}</h3>
      <p class="hint">{E.hint}</p>
      {#if many && hasOwn(t, E) && where === 'all'}
        <p class="warn">
          «{typeLabel(t)}» tiene ajustes propios en este elemento, que mandan sobre los de todos.
          <button class="small" onclick={() => clearOwn(t, E)}>Quitarlos</button>
        </p>
      {/if}

      {#if E.id === 'fondo'}
        {@render pieceRow('fondo', 'Color de fondo')}
        {@render pieceRow('marco', 'Marco de la carta')}
        <div class="ctl images">
          <div class="slotitem">
            <ResourceSlot
              url={lib.url(eff.images?.background)}
              label="Imagen de fondo"
              custom={!!eff.images?.background}
              active={picking === 'background'}
              size={56}
              onclick={() => (picking = picking === 'background' ? null : 'background')}
              onfile={(f) => setImage('background', lib.add([f], 'fondos')[0])}
              onpath={(p) => setImage('background', p)}
            />
            <small>Imagen de fondo</small>
            {#if eff.images?.background}<button class="ghost small" onclick={() => setImage('background', undefined)}>Quitar</button>{/if}
          </div>
          <div class="slotitem">
            <ResourceSlot
              url={lib.url(eff.images?.frame)}
              label="Marco"
              custom={!!eff.images?.frame}
              active={picking === 'frame'}
              size={56}
              onclick={() => (picking = picking === 'frame' ? null : 'frame')}
              onfile={(f) => setImage('frame', lib.add([f], 'fondos')[0])}
              onpath={(p) => setImage('frame', p)}
            />
            <small>Marco</small>
            {#if eff.images?.frame}<button class="ghost small" onclick={() => setImage('frame', undefined)}>Quitar</button>{/if}
          </div>
        </div>
        <p class="hint">
          Tamaño ideal: la carta con su sangrado, <b>{px.width} × {px.height} px</b> a 300 ppp ({answers.size.width + 6} ×
          {answers.size.height + 6} mm). El fondo va debajo de todo; el <b>marco</b> es un PNG con transparencia que va encima de la
          ilustración y debajo de los textos. Con un marco, quizá quieras dejar transparentes las bandas y cajas.
        </p>
        <ResourceShelf
          items={lib.items('fondos')}
          compact
          selected={picking === 'background' ? (eff.images?.background ?? '') : picking === 'frame' ? (eff.images?.frame ?? '') : ''}
          onpick={picking === 'background' || picking === 'frame' ? (p) => setImage(picking as 'background' | 'frame', p) : undefined}
          onadd={(files) => {
            const [p] = lib.add(files, 'fondos');
            if (picking === 'background' || picking === 'frame') setImage(picking, p);
          }}
          onremove={lib.remove}
          empty="Sin fondos. Suelta aquí tus imágenes de fondo y marcos."
        />
        {#if picking === 'background' || picking === 'frame'}
          <p class="hint">Elige {picking === 'background' ? 'el fondo' : 'el marco'} en la lista, o suelta una imagen nueva.</p>
        {/if}
      {:else if E.id === 'ilustracion'}
        {#if has('reglas') || has('ambientacion')}
          <div class="ctl">
            <span class="lbl">Tamaño</span>
            <label class="inline">
              <input type="range" min="0.3" max="0.75" step="0.05" value={layout.art} oninput={(e) => setLayout('art', e.currentTarget.valueAsNumber)} aria-label="Tamaño de la ilustración" />
              {Math.round(layout.art * 100)} % del espacio libre
            </label>
          </div>
        {/if}
        {@render pieceRow('marco ilustracion', 'Marco de la ilustración', false)}
        <p class="hint">Las ilustraciones de cada carta vienen de «Tu material» o se ponen en la tabla de «Cartas».</p>
      {:else if E.id === 'titulo'}
        {@render textRows('titulo', 'Título')}
        {@render pieceRow('cabecera', 'Banda del título')}
        {@render pieceRow('placa', 'Placa del nombre')}
      {:else if E.id === 'linea'}
        {@render textRows('linea de tipo', 'Línea de tipo')}
        {@render pieceRow('banda tipo', 'Banda')}
      {:else if E.id === 'reglas'}
        {@render textRows('reglas', 'Reglas')}
        {@render pieceRow('caja de texto', 'Caja de texto')}
        {@render pieceRow('panel', 'Panel de texto')}
        {#if has('ilustracion')}
          <div class="ctl">
            <span class="lbl">Alto de la caja</span>
            <label class="inline">
              <input type="range" min="0.25" max="0.7" step="0.05" value={1 - layout.art} oninput={(e) => setLayout('art', Math.round((1 - e.currentTarget.valueAsNumber) * 100) / 100)} aria-label="Alto de la caja de texto" />
              {Math.round((1 - layout.art) * 100)} %
            </label>
          </div>
        {/if}
        <p class="hint">Si la caja queda transparente sobre la ilustración, cambia el color del texto para que se lea.</p>
      {:else if E.id === 'ambientacion'}
        {@render textRows('ambientacion', 'Ambientación')}
      {:else if E.id === 'atributos'}
        {@const ic = eff.icons?.atributos ?? {}}
        <div class="ctl">
          <span class="lbl">Posición</span>
          <div class="seg" role="group" aria-label="Posición de los atributos">
            {#each [['left', 'A la izquierda'], ['right', 'A la derecha'], ['bottom', 'Abajo, en fila']] as [v, name]}
              <button class:active={layout.attrSide === v} onclick={() => setLayout('attrSide', v as never)}>{name}</button>
            {/each}
          </div>
        </div>
        <div class="ctl">
          <span class="lbl">Número</span>
          <div class="seg" role="group" aria-label="Dónde va el número">
            {#each [['over', 'Encima del icono'], ['after', 'Al lado'], ['below', 'Debajo']] as [v, name]}
              <button class:active={(ic.value ?? 'over') === v} onclick={() => (icon('atributos').value = v as never)}>{name}</button>
            {/each}
          </div>
        </div>
        <div class="ctl">
          <span class="lbl">Tamaño</span>
          <label class="inline">
            <input type="range" min="0.5" max="1" step="0.05" value={ic.scale ?? 1} oninput={(e) => (icon('atributos').scale = e.currentTarget.valueAsNumber)} aria-label="Tamaño de los iconos de atributos" />
            {Math.round((ic.scale ?? 1) * 100)} %
          </label>
        </div>
        {@render pieceRow('fondo atributos', 'Fondo de los atributos')}
        <span class="lbl">Qué atributos lleva</span>
        {@render attrEditor('number')}
        {@render iconShelf()}
      {:else if E.id === 'habilidades'}
        {@const ic = eff.icons?.habilidades ?? {}}
        <div class="ctl">
          <span class="lbl">Nombre</span>
          <label class="inline"><input type="checkbox" checked={!!ic.labels} onchange={(e) => (icon('habilidades').labels = e.currentTarget.checked)} /> Escribir el nombre junto al icono («Volar»)</label>
        </div>
        <div class="ctl">
          <span class="lbl">Fondo del icono</span>
          {@render swatches(ic.backdrop ?? 'papel', 'Fondo de las habilidades', (c) => (icon('habilidades').backdrop = c))}
        </div>
        <div class="ctl">
          <span class="lbl">Alineación</span>
          <div class="seg" role="group" aria-label="Alineación de las habilidades">
            {#each [['start', 'Izquierda'], ['center', 'Centro'], ['end', 'Derecha']] as [v, name]}
              <button class:active={(ic.align ?? (zone('habilidades') as { align?: string } | undefined)?.align) === v} onclick={() => (icon('habilidades').align = v as never)}>{name}</button>
            {/each}
          </div>
        </div>
        <div class="ctl">
          <span class="lbl">Tamaño</span>
          <label class="inline">
            <input type="range" min="0.5" max="1" step="0.05" value={ic.scale ?? 1} oninput={(e) => (icon('habilidades').scale = e.currentTarget.valueAsNumber)} aria-label="Tamaño de las habilidades" />
            {Math.round((ic.scale ?? 1) * 100)} %
          </label>
        </div>
        <span class="lbl">Qué habilidades puede tener</span>
        {@render attrEditor('icon')}
        {@render iconShelf()}
        <p class="hint">Qué cartas tienen cada habilidad se marca en la tabla de cartas.</p>
      {:else if E.id === 'coste'}
        <div class="ctl">
          <span class="lbl">Esquina</span>
          <div class="seg" role="group" aria-label="Esquina del coste">
            {#each [['left', 'Izquierda'], ['right', 'Derecha']] as [v, name]}
              <button class:active={layout.costCorner === v} onclick={() => setLayout('costCorner', v as never)}>{name}</button>
            {/each}
          </div>
        </div>
        <div class="ctl">
          <span class="lbl">Tamaño</span>
          <label class="inline">
            <input type="range" min="0.5" max="1" step="0.05" value={eff.icons?.coste?.scale ?? 1} oninput={(e) => (icon('coste').scale = e.currentTarget.valueAsNumber)} aria-label="Tamaño del coste" />
            {Math.round((eff.icons?.coste?.scale ?? 1) * 100)} %
          </label>
        </div>
        <div class="slots">
          <div class="slotitem">
            <ResourceSlot
              url={costUrl}
              label="Coste"
              custom={!!answers.costIcon}
              active={picking === 'coste'}
              size={40}
              onclick={() => pickIcon('coste')}
              onfile={(f) => setIcon('coste', lib.add([f], 'iconos')[0])}
              onpath={(p) => setIcon('coste', p)}
            />
            <small>Coste</small>
          </div>
        </div>
        {@render iconShelf()}
      {:else if E.id === 'rareza'}
        <div class="ctl">
          <span class="lbl">Tamaño de la marca</span>
          <label class="inline">
            <input type="range" min="0.5" max="1" step="0.05" value={eff.icons?.marca?.scale ?? 1} oninput={(e) => (icon('marca').scale = e.currentTarget.valueAsNumber)} aria-label="Tamaño de la marca" />
            {Math.round((eff.icons?.marca?.scale ?? 1) * 100)} %
          </label>
        </div>
        <span class="lbl">{answers.variant.column || 'Rareza'}: colores de cada valor (para todos los tipos)</span>
        <div class="values">
          {#each answers.variant.values as v}
            <label class="inline"><input type="color" bind:value={v.color} /> {v.name}</label>
          {/each}
        </div>
      {:else if E.id === 'numero'}
        {@render textRows('numero', 'Número de colección')}
      {/if}

      <div class="foot">
        {#if ELEMENT_OF[E.id]}
          <button class="ghost small" onclick={() => removeElement(ELEMENT_OF[E.id]!)} title={src !== t ? `También en «${typeLabel(src)}»` : undefined}>
            Quitar {E.id === 'atributos' || E.id === 'habilidades' ? 'atributos y habilidades' : `«${E.label}»`} de «{typeLabel(t)}»
          </button>
          <span class="grow"></span>
        {/if}
        <button class="ghost small" onclick={reset}>
          {where === 'type' ? `Quitar los ajustes propios de «${typeLabel(t)}» aquí` : 'Restablecer este elemento'}
        </button>
      </div>
    </section>
  </div>
{/if}

<style>
  .tour {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 20px;
    align-items: center;
    justify-content: space-between;
  }
  .where small {
    color: var(--muted);
    margin-left: 6px;
  }
  .scope {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
    color: var(--muted);
  }
  .els {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .els button {
    padding: 3px 10px;
    font-size: 12px;
    border-radius: 999px;
  }
  .els button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .els button.own::after {
    content: ' •';
    color: var(--warn);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  h3 {
    margin: 0;
  }
  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    max-width: 62ch;
  }
  .warn {
    margin: 0;
    color: var(--warn);
    font-size: 13px;
  }
  .ctl {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
  }
  .lbl {
    min-width: 110px;
    font-weight: 600;
    font-size: 13px;
  }
  .inline {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--muted);
    font-size: 13px;
  }
  .seg {
    display: flex;
  }
  .seg button {
    border-radius: 0;
    padding: 3px 9px;
    font-size: 12px;
  }
  .seg button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .seg button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .seg button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .slots,
  .images {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }
  .slotitem {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .slotitem small {
    font-size: 11px;
    color: var(--muted);
  }
  .values {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  button.small {
    padding: 2px 10px;
    font-size: 12px;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .grow {
    flex: 1;
  }
  .attrs {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  .attr {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .attr .name {
    min-width: 110px;
  }
  .attr .name.off {
    color: var(--muted);
    text-decoration: line-through;
  }
  select.add {
    padding: 2px 8px;
    font-size: 12px;
    border-radius: 999px;
  }
</style>
