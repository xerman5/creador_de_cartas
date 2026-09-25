import type { AssetStore } from '../core/assets';

/**
 * Miniaturas de recursos del proyecto: ruta → URL. Usa la caché de imágenes del proyecto,
 * así que pedir otra vez las mismas no cuesta nada. Llamar durante la inicialización del componente.
 */
export function thumbUrls(source: () => { assets: AssetStore | undefined; paths: string[] }) {
  let urls = $state.raw(new Map<string, string>());
  $effect(() => {
    const { assets, paths } = source();
    if (!assets) return;
    let cancelled = false;
    Promise.all(paths.map(async (p) => [p, (await assets.image(p))?.src ?? ''] as const)).then((list) => {
      if (!cancelled) urls = new Map(list.filter(([, u]) => u));
    });
    return () => (cancelled = true);
  });
  return {
    get urls() {
      return urls;
    },
  };
}
