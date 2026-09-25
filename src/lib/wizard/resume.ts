import type { FileSource } from '../../core/assets';
import { readText } from '../../core/text';
import type { Project } from '../../core/types';
import type { WizardAnswers } from '../../core/wizard/answers';
import { IMAGES_DIR } from '../../core/wizard/images';
import { RESOURCE_FILE, shelfOf, type Resources } from '../../core/wizard/resources';
import { parseWizardFile, resumeAnswers, WIZARD_FILE, type WizardFile } from '../../core/wizard/sync';

/** Todo lo que necesita el asistente para seguir trabajando sobre un proyecto ya creado. */
export interface ResumeContext {
  source: FileSource;
  /** El proyecto tal como está guardado. */
  project: Project;
  /** El CSV tal como está guardado. */
  csv: string;
  file: WizardFile;
  answers: WizardAnswers;
  /** Qué se ha traído de lo cambiado fuera del asistente. */
  notes: string[];
  /** Iconos y fondos de assets/. */
  resources: Resources;
  /** Ilustraciones de assets/ilustraciones/ (ruta dentro de esa carpeta). */
  images: Map<string, Blob>;
}

/** Lee asistente.json, el CSV y los recursos del proyecto. `null` si el proyecto no se hizo con el asistente. */
export async function loadResume(source: FileSource, project: Project): Promise<ResumeContext | null> {
  const blob = await source.read(WIZARD_FILE);
  if (!blob) return null;
  const file = parseWizardFile(await readText(blob));
  const csvBlob = await source.read(project.csv);
  const csv = csvBlob ? await readText(csvBlob) : '';
  const { answers, notes } = resumeAnswers(file, project, csv);

  const resources: Resources = new Map();
  const images = new Map<string, Blob>();
  const paths = ((await source.list?.(project.assetsDir)) ?? []).filter((p) => RESOURCE_FILE.test(p));
  for (const path of paths) {
    const shelf = shelfOf(path);
    if (shelf !== 'iconos' && shelf !== 'fondos' && shelf !== 'ilustraciones') continue;
    const data = await source.read(`${project.assetsDir}/${path}`);
    if (!data) continue;
    if (shelf === 'ilustraciones') images.set(path.slice(IMAGES_DIR.length + 1), data);
    else resources.set(path, data);
  }
  return { source, project, csv, file, answers, notes, resources, images };
}
