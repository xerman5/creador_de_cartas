import { expect, test } from '@playwright/test';
import { fixture, goStep, mockFolder, next, nextUntil, readFolderFile, shot, trackErrors } from './helpers';

test('convención tipo + número: los nombres de las imágenes crean tipos y cartas, y las asignan', async ({ page, context }) => {
  const errors = trackErrors(page);
  await mockFolder(context, 'convencion');
  await page.goto('/');
  await page.getByText('Crear con el asistente').click();
  await page.fill('#wz-name', 'Aventura');
  await next(page);
  // Sin material todavía: los tipos a mano.
  await next(page);

  // Dos tipos escritos a mano…
  const rows = page.locator('table.types tbody tr');
  await rows.nth(0).locator('input[type=text]:not(.clase)').fill('Lugar');
  await rows.nth(0).locator('input[type=number]').fill('2');
  await page.getByRole('button', { name: '＋ Añadir tipo' }).click();
  await rows.nth(1).locator('input[type=text]:not(.clase)').fill('Enemigo');
  await rows.nth(1).locator('input[type=number]').fill('1');

  // …y, de vuelta en «Tu material», la carpeta de ilustraciones: lugar001-003, evento-1/2, Enemgo_1 (mal escrito).
  await goStep(page, 'Tu material');
  await page.locator('input[webkitdirectory]').last().setInputFiles(fixture('convencion'));
  const panel = page.locator('.naming');
  await expect(panel).toContainText('«Lugar» tiene imágenes hasta la 3 y 2 cartas');
  await expect(panel).toContainText('Crear «Evento» con 2 cartas');
  await expect(panel.getByRole('button', { name: 'Son de «Enemigo»' })).toBeVisible();
  await shot(page, 'convencion-tipos');
  await panel.getByRole('button', { name: 'Hacerlo todo' }).click();
  await expect(page.locator('.naming')).toHaveCount(0);
  // Todas emparejadas: por id (enemigo-001, la renombrada) o por tipo y número (lugar001, evento-1).
  await expect(page.locator('.report').first()).toContainText('6 imágenes: 6 en cartas.');
  await goStep(page, 'Tipos de carta');
  const types = await rows.evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll('input:not(.clase)')].map((i) => (i as HTMLInputElement).value).join(':')),
  );
  expect(types).toEqual(['Lugar:3', 'Enemigo:1', 'Evento:2']);


  // Camino rápido: de la estructura, directo a crear con el diseño por defecto.
  await page.getByRole('button', { name: 'Terminar ya ⇥' }).click();
  await expect(page.locator('.steps button.active')).toContainText('Crear');
  await page.getByRole('button', { name: 'Guardar en una carpeta…' }).click();
  await expect(page.locator('.pending')).toBeVisible();
  const csv = (await readFolderFile(page, 'convencion', 'cartas.csv'))!;
  expect(csv).toMatch(/^lugar-003,Lugar,.*ilustraciones\/lugar003\.png/m);
  expect(csv).toMatch(/^enemigo-001,Enemigo,.*ilustraciones\/enemigo-001\.png/m);
  expect(csv).toMatch(/^evento-002,Evento,.*ilustraciones\/evento-2\.png/m);

  // Editor: una imagen nueva «lugar004.png» → asignar por nombre ofrece crear la carta que falta.
  await page.getByRole('button', { name: '2 · Recursos' }).click();
  await page.locator('.resources section').nth(2).locator('input[type=file]').setInputFiles(fixture('extra', 'lugar004.png'));
  await page.getByRole('button', { name: 'Asignar por nombre' }).click();
  await expect(page.locator('.resources')).toContainText('«Lugar» tiene imágenes hasta la 4 y 3 cartas');
  await page.getByRole('button', { name: 'Crear la que falta' }).click();
  await expect(page.locator('.resources .report')).toContainText('1 ilustración asignada');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await readFolderFile(page, 'convencion', 'cartas.csv')) ?? '').toMatch(/^lugar-004,Lugar,.*ilustraciones\/lugar004\.png/m);

  expect(errors).toEqual([]);
});
