import { expect, test } from '@playwright/test';
import { activeStep, fixture, mockFolder, next, nextUntil, readFolderFile, shot, trackErrors } from './helpers';

test('tu material primero: una hoja de cálculo, imágenes a lo bruto y la bandeja de la tabla', async ({ page, context }) => {
  const errors = trackErrors(page);
  await mockFolder(context, 'material');
  await page.goto('/');
  await page.getByText('Crear con el asistente').click();
  await page.fill('#wz-name', 'Bosque');
  await next(page);
  await expect(activeStep(page)).toContainText('Tu material');

  // La hoja de cálculo dice los tipos, las cartas y una habilidad nueva.
  await page.locator('input[accept=".csv,.txt,text/csv"]').setInputFiles(fixture('hoja', 'cartas.csv'));
  await expect(page.locator('.report').first()).toContainText('De la hoja de cálculo: Tipos nuevos: Criatura (2), Lugar (1) · Habilidades: Volar.');

  // Imágenes: «torre-oscura» es el título de una carta; las demás no dicen nada (fotos de cámara).
  await page.locator('input[webkitdirectory]').last().setInputFiles(fixture('bruto'));
  await expect(page.locator('.report').first()).toContainText('4 imágenes: 1 en cartas · 3 sin carta.');
  await expect(page.locator('.report').first()).toContainText('1 por título');
  const loose = page.locator('.loose');
  await expect(loose).toContainText('3 imágenes sin carta');
  // La subcarpeta «lugares» se elige entera y propone su tipo.
  await loose.locator('.group', { hasText: 'lugares' }).getByRole('button', { name: 'Elegir las 2' }).click();
  await expect(page.getByLabel('Tipo de las cartas nuevas')).toHaveValue('1');
  await shot(page, 'material-bruto');
  await loose.getByRole('button', { name: 'Hacer 2 cartas' }).click();
  await expect(page.locator('.report', { hasText: 'con su imagen' })).toContainText('2 cartas de «Lugar» con su imagen.');
  await expect(loose).toContainText('1 imagen sin carta');

  // Los tipos ya vienen de tu material.
  await next(page);
  const types = await page
    .locator('table.types tbody tr')
    .evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('input:not(.clase)')].map((i) => (i as HTMLInputElement).value).join(':')));
  expect(types).toEqual(['Criatura:2', 'Lugar:3']);

  // Paso 4: los lugares no llevan título dibujado (la carta sigue teniendo nombre en la tabla).
  await next(page);
  await page.locator('.questions .tabs button', { hasText: 'Lugar' }).click();
  const title = page.locator('.element', { has: page.locator('b', { hasText: /^Título$/ }) });
  await expect(title).toHaveClass(/active/);
  await title.click();
  await expect(title).not.toHaveClass(/active/);

  // En la tabla, la imagen que queda se pone en una carta desde la bandeja.
  await nextUntil(page, 'Cartas');
  await page.locator('.questions .tabs button', { hasText: 'Criatura' }).click();
  await expect(page.locator('table.cards tbody tr').first().locator('input[type=checkbox]')).toBeChecked();
  await page.locator('table.cards tbody tr').nth(1).click();
  await page.locator('.tray .thumb', { hasText: 'IMG_3000.png' }).click();
  await expect(page.locator('.tray')).toHaveCount(0);
  await shot(page, 'material-bandeja');

  await page.getByRole('button', { name: 'Terminar ya ⇥' }).click();
  await page.getByRole('button', { name: 'Guardar en una carpeta…' }).click();
  await expect(page.locator('.pending')).toBeVisible();
  const csv = (await readFolderFile(page, 'material', 'cartas.csv'))!;
  expect(csv).toMatch(/^criatura-001,Criatura,Lobo,Muerde,.*ataque:3 \| volar/m);
  expect(csv).toMatch(/^criatura-002,Criatura,Cuervo,.*ilustraciones\/IMG_3000\.png/m);
  expect(csv).toMatch(/^lugar-001,Lugar,Torre oscura,.*ilustraciones\/torre-oscura\.png/m);
  expect(csv).toMatch(/^lugar-003,Lugar,.*ilustraciones\/lugares\/IMG_2042\.png/m);
  const project = JSON.parse((await readFolderFile(page, 'material', 'proyecto.json'))!);
  const ids = (t: string) => project.templates[t].zones.map((z: { id: string }) => z.id);
  expect(ids('criatura')).toContain('titulo');
  expect(ids('lugar')).not.toContain('titulo');

  expect(errors).toEqual([]);
});
