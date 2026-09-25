import { expect, test } from '@playwright/test';
import { fixture, mockFolder, nextUntil, readFolderFile, shot, startWizard, toggleElements, trackErrors } from './helpers';

test('encuadre en el asistente y tabla de cartas en el editor, con deshacer y guardado del CSV', async ({ page, context }) => {
  const errors = trackErrors(page);
  await mockFolder(context, 'tabla');
  await startWizard(page, 'Bestias', [{ label: 'Criatura', count: 3 }]);
  await toggleElements(page, ['Atributos y habilidades']);
  await nextUntil(page, 'Imágenes');

  // Una ilustración propia para la primera carta (por su id) y su encuadre.
  await page.locator('input[webkitdirectory]').last().setInputFiles(fixture('ilustraciones'));
  await expect(page.locator('.report').first()).toContainText('1 por id');
  await page.locator('.steps button', { hasText: 'Cartas' }).click();
  await page.locator('table.cards tbody tr').first().click();
  const zoom = page.getByLabel('Encuadre de la ilustración: ampliación');
  await zoom.fill('2');
  await expect(zoom).toHaveValue('2');
  await shot(page, 'asistente-encuadre');

  await nextUntil(page, 'Crear');
  await page.getByRole('button', { name: 'Guardar en una carpeta…' }).click();
  await expect(page.locator('.pending')).toBeVisible();
  expect(await readFolderFile(page, 'tabla', 'cartas.csv')).toContain('ilustraciones/CRI-001.png,50% 50% 2');

  // Tabla: editar un título, añadir, duplicar y quitar cartas; deshacer.
  await page.getByRole('button', { name: '4 · Tabla' }).click();
  const rows = page.locator('.table-view tbody tr');
  await expect(rows).toHaveCount(4); // 3 cartas y la trasera
  await page.getByLabel('titulo, fila 1').fill('Lobo');
  await rows.first().click();
  await page.getByRole('button', { name: '＋ Carta' }).click();
  await expect(rows).toHaveCount(5);
  await expect(page.getByLabel('id, fila 2')).toHaveValue('CRI-004');
  await page.getByRole('button', { name: 'Duplicar' }).click();
  await expect(page.getByLabel('id, fila 3')).toHaveValue('CRI-005');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Quitar' }).click();
  await expect(rows).toHaveCount(5);
  await page.locator('.table-view .toolbar').click();
  await page.keyboard.press('Control+z');
  await expect(rows).toHaveCount(6);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(rows).toHaveCount(4);
  await expect(page.getByLabel('titulo, fila 1')).toHaveValue('Lobo');

  // Panel de la carta: atributos con casillas y encuadre arrastrando la imagen.
  await rows.first().click();
  await page.getByLabel('Valor de Ataque').fill('9');
  await expect(page.getByLabel('atributos, fila 1')).toHaveValue(/ataque:9/);
  const box = page.getByRole('slider', { name: 'Encuadre de ilustracion: arrastra para mover la imagen' });
  const b = (await box.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByLabel('encuadre, fila 1')).not.toHaveValue('50% 50% 2');
  await shot(page, 'tabla');

  // Guardar escribe el CSV con sus cabeceras de siempre.
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await readFolderFile(page, 'tabla', 'cartas.csv')) ?? '').toContain('Lobo');
  const csv = (await readFolderFile(page, 'tabla', 'cartas.csv'))!;
  expect(csv.split('\n')[0]).toBe('id,tipo,titulo,descripcion,sabor,atributos,ilustracion,encuadre,numero,copias');
  expect(csv).toMatch(/CRI-001,Criatura,Lobo,.*ataque:9/);

  expect(errors).toEqual([]);
});
