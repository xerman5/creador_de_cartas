import type { FontFile } from './types';

/** De dónde se leen los archivos del proyecto: carpeta local, lista de archivos o URL. */
export interface FileSource {
  label: string;
  read(path: string): Promise<Blob | null>;
  /** Huella de modificación de los archivos, para recargar automáticamente. */
  stamp?(paths: string[]): Promise<string>;
  /** Solo en fuentes con permiso de escritura (carpetas en Chrome/Edge). */
  write?(path: string, data: string | Blob): Promise<void>;
  /** Archivos dentro de una carpeta, con rutas relativas a ella. */
  list?(dir: string): Promise<string[]>;
  /** Borra un archivo si existe (solo con permiso de escritura). */
  remove?(path: string): Promise<void>;
  /** Pide permiso de escritura; hay que llamarlo justo tras el clic del usuario. */
  requestWrite?(): Promise<void>;
}

function cleanPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+/g, '/');
}

/** Carpeta abierta con la File System Access API (Chrome/Edge). Se puede releer del disco. */
export class DirectorySource implements FileSource {
  constructor(private root: FileSystemDirectoryHandle) {}

  get label() {
    return this.root.name;
  }

  private async dir(parts: string[], create = false): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return dir;
  }

  private async file(path: string): Promise<File | null> {
    const parts = cleanPath(path).split('/').filter(Boolean);
    if (!parts.length) return null;
    try {
      const dir = await this.dir(parts.slice(0, -1));
      return await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
    } catch {
      return null;
    }
  }

  read(path: string) {
    return this.file(path);
  }

  async stamp(paths: string[]) {
    const files = await Promise.all(paths.map((p) => this.file(p)));
    return files.map((f) => `${f?.lastModified ?? 0}:${f?.size ?? 0}`).join('|');
  }

  requestWrite() {
    return this.ensureWritable();
  }

  private async ensureWritable() {
    if ((await this.root.queryPermission?.({ mode: 'readwrite' })) !== 'granted') {
      const state = await this.root.requestPermission?.({ mode: 'readwrite' });
      if (state && state !== 'granted') throw new Error('No hay permiso para escribir en la carpeta.');
    }
  }

  async remove(path: string) {
    await this.ensureWritable();
    const parts = cleanPath(path).split('/').filter(Boolean);
    try {
      await (await this.dir(parts.slice(0, -1))).removeEntry(parts[parts.length - 1]);
    } catch {
      // ya no existe
    }
  }

  async write(path: string, data: string | Blob) {
    await this.ensureWritable();
    const parts = cleanPath(path).split('/').filter(Boolean);
    const dir = await this.dir(parts.slice(0, -1), true);
    const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async list(dirPath: string) {
    const out: string[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, handle] of dir.entries()) {
        if (name.startsWith('.')) continue;
        if (handle.kind === 'file') out.push(prefix + name);
        else await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
      }
    };
    try {
      await walk(await this.dir(cleanPath(dirPath).split('/').filter(Boolean)), '');
    } catch {
      // la carpeta no existe
    }
    return out.sort();
  }
}

/** Archivos elegidos con <input webkitdirectory> (resto de navegadores). Es una instantánea. */
export class FileListSource implements FileSource {
  private files = new Map<string, { path: string; file: File }>();
  label = '';

  constructor(list: FileList) {
    for (const file of Array.from(list)) {
      const [root, ...rest] = cleanPath(file.webkitRelativePath || file.name).split('/');
      this.label ||= root;
      const path = rest.join('/');
      this.files.set(path.toLowerCase(), { path, file });
    }
  }

  async read(path: string) {
    return this.files.get(cleanPath(path).toLowerCase())?.file ?? null;
  }

  async list(dir: string) {
    const prefix = `${cleanPath(dir)}/`.toLowerCase();
    return [...this.files.values()]
      .filter((f) => f.path.toLowerCase().startsWith(prefix))
      .map((f) => f.path.slice(prefix.length))
      .sort();
  }
}

/** Archivos en memoria: el proyecto del asistente antes de guardarlo. */
export class MemorySource implements FileSource {
  private files = new Map<string, Blob>();

  constructor(
    public label: string,
    files: Record<string, string | Blob>,
  ) {
    for (const [path, data] of Object.entries(files)) {
      this.files.set(cleanPath(path).toLowerCase(), typeof data === 'string' ? new Blob([data]) : data);
    }
  }

  async read(path: string) {
    return this.files.get(cleanPath(path).toLowerCase()) ?? null;
  }

  async list(dir: string) {
    const prefix = `${cleanPath(dir)}/`.toLowerCase();
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)).sort();
  }
}

/** Proyecto servido por HTTP (el ejemplo incluido). */
export class UrlSource implements FileSource {
  constructor(
    private base: string,
    public label: string,
  ) {}

  async read(path: string) {
    try {
      const res = await fetch(this.base + cleanPath(path), { cache: 'no-cache' });
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  }
}

/** Caché de imágenes y carga de fuentes de un proyecto. */
export class AssetStore {
  private images = new Map<string, Promise<HTMLImageElement | null>>();
  private urls: string[] = [];

  constructor(
    private source: FileSource,
    private assetsDir: string,
  ) {}

  /** Busca primero en la carpeta de recursos y luego desde la raíz del proyecto. */
  private async readAsset(path: string): Promise<Blob | null> {
    const p = cleanPath(path);
    return (this.assetsDir && (await this.source.read(`${this.assetsDir}/${p}`))) || (await this.source.read(p));
  }

  image(path: string): Promise<HTMLImageElement | null> {
    const key = cleanPath(path);
    let img = this.images.get(key);
    if (!img) {
      img = this.loadImage(key);
      this.images.set(key, img);
    }
    return img;
  }

  /** Olvida una imagen de la caché (p. ej. después de subir un archivo nuevo con esa ruta). */
  forget(path: string) {
    this.images.delete(cleanPath(path));
  }

  private async loadImage(path: string): Promise<HTMLImageElement | null> {
    let blob = await this.readAsset(path);
    if (!blob) return null;
    if (/\.svg$/i.test(path) && blob.type !== 'image/svg+xml') blob = new Blob([blob], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    this.urls.push(url);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
      return img;
    } catch {
      return null;
    }
  }

  async loadFonts(fonts: FontFile[]): Promise<string[]> {
    const errors: string[] = [];
    for (const f of fonts) {
      const blob = await this.readAsset(f.file);
      if (!blob) {
        errors.push(`No se encuentra la fuente «${f.file}».`);
        continue;
      }
      try {
        const face = new FontFace(f.family, await blob.arrayBuffer(), { weight: f.weight, style: f.style });
        document.fonts.add(await face.load());
      } catch {
        errors.push(`No se pudo cargar la fuente «${f.file}».`);
      }
    }
    return errors;
  }

  dispose() {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
    this.images.clear();
  }
}
