import { expect, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';

export const fixture = (...p: string[]) => path.join(import.meta.dirname, 'fixtures', ...p);

/**
 * «Elegir carpeta» abre una carpeta del almacenamiento privado del navegador (OPFS), que se puede
 * leer y escribir igual que una carpeta de verdad y se puede inspeccionar desde la prueba.
 */
export async function mockFolder(context: BrowserContext, name: string) {
  await context.addInitScript((dir) => {
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(dir, { create: true });
  }, name);
}

/** Lee un archivo de esa carpeta. */
export async function readFolderFile(page: Page, folder: string, file: string): Promise<string | null> {
  return page.evaluate(
    async ([dir, p]) => {
      let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
      const parts = p.split('/');
      try {
        for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part);
        return await (await (await d.getFileHandle(parts[parts.length - 1])).getFile()).text();
      } catch {
        return null;
      }
    },
    [folder, file] as const,
  );
}

/** Escribe un archivo en esa carpeta (como si se editara con otro programa). */
export async function writeFolderFile(page: Page, folder: string, file: string, text: string) {
  await page.evaluate(
    async ([dir, p, t]) => {
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
      const w = await (await d.getFileHandle(p, { create: true })).createWritable();
      await w.write(t);
      await w.close();
    },
    [folder, file, text] as const,
  );
}

/** Falla si la página lanza algún error. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

export const next = (page: Page) => page.getByRole('button', { name: 'Siguiente →' }).click();

export const activeStep = (page: Page) => page.locator('.steps button.active');

/** «Siguiente» hasta llegar al paso (el recorrido pide un clic por elemento). */
export async function nextUntil(page: Page, title: string) {
  for (let i = 0; i < 60; i++) {
    if ((await activeStep(page).innerText()).includes(title)) return;
    await next(page);
  }
  throw new Error(`No se llega al paso «${title}»`);
}

export interface TypeSpec {
  label: string;
  count: number;
}

/** Abre el asistente y rellena nombre y tipos; deja el asistente en «Qué lleva cada carta». */
export async function startWizard(page: Page, name: string, types: TypeSpec[]) {
  await page.goto('/');
  await page.getByText('Crear con el asistente').click();
  await page.fill('#wz-name', name);
  await next(page);
  const rows = page.locator('table.types tbody tr');
  for (const [i, t] of types.entries()) {
    if (i > 0) await page.getByRole('button', { name: '＋ Añadir tipo' }).click();
    await rows.nth(i).locator('input[type=text]').fill(t.label);
    await rows.nth(i).locator('input[type=number]').fill(String(t.count));
  }
  await next(page);
  await expect(activeStep(page)).toContainText('Qué lleva cada carta');
}

/** Marca elementos del tipo seleccionado (los que ya estén marcados se desmarcan). */
export async function toggleElements(page: Page, labels: string[]) {
  for (const l of labels) await page.locator('.element', { hasText: l }).click();
}
