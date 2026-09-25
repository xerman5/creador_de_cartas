import { expect, test } from '@playwright/test';
import { fixture, mockFolder, next, nextUntil, readFolderFile, shot, trackErrors } from './helpers';

test('clases y subclases desde los nombres, otra clase con los mismos tipos, y referencias al lado de la carta', async ({ page, context }) => {
  const errors = trackErrors(page);
  await mockFolder(context, 'clases');
  page.on('dialog', (d) => d.accept('Enano'));
  await page.goto('/');
  await page.getByText('Crear con el asistente').click();
  await page.fill('#wz-name', 'Reinos');
  await next(page);

  // «Tu material», antes que los tipos: la carpeta de ilustraciones los crea, con su clase.
  await expect(page.locator('.steps button.active')).toContainText('Tu material');
  await page.locator('input[webkitdirectory]').last().setInputFiles(fixture('clases'));
  const panel = page.locator('.naming');
  await expect(panel).toContainText('Crear «Elfo · Ataque» con 2 cartas');
  await expect(panel).toContainText('Crear «Elfo · Recurso» con 1 carta');
  await expect(panel).toContainText('Crear «Orco · Ataque» con 1 carta');
  await panel.getByRole('button', { name: 'Hacerlo todo' }).click();
  // Las cinco ilustraciones y la referencia, cada una a su carta.
  await expect(page.locator('.report').first()).toContainText('6 imágenes: 5 en cartas · 1 referencia.');
  await next(page);
  const rows = page.locator('table.types tbody tr');
  const types = () =>
    rows.evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value).join(':')));
  expect(await types()).toEqual(['Elfo:Ataque:2', 'Elfo:Lugar:1', 'Elfo:Recurso:1', 'Orco:Ataque:1']);

  // Otra clase con los mismos tipos que la primera.
  await page.getByRole('button', { name: '＋ Otra clase con los mismos tipos' }).click();
  expect(await types()).toEqual(['Elfo:Ataque:2', 'Elfo:Lugar:1', 'Elfo:Recurso:1', 'Orco:Ataque:1', 'Enano:Ataque:2', 'Enano:Lugar:1', 'Enano:Recurso:1']);
  await shot(page, 'clases-tipos');

  // En la tabla, la carta con referencia la enseña al lado.
  await nextUntil(page, 'Cartas');
  await page.locator('.questions .tabs button', { hasText: 'Elfo · Recurso' }).click();
  await page.locator('table.cards tbody tr').first().click();
  await expect(page.locator('aside.preview figure.ref img')).toBeVisible();
  await shot(page, 'clases-referencia');

  await nextUntil(page, 'Crear');
  await page.getByRole('button', { name: 'Guardar en una carpeta…' }).click();
  await expect(page.locator('.pending')).toBeVisible();
  const csv = (await readFolderFile(page, 'clases', 'cartas.csv'))!;
  const lines = csv.trimEnd().split('\n');
  expect(lines[0]).toMatch(/^id,tipo,clase,subclase,/);
  expect(lines[0]).toContain(',referencia,');
  expect(csv).toMatch(/^elfo-ataque-002,Elfo Ataque,Elfo,Ataque,.*ilustraciones\/elfos-ataque-002\.png/m);
  expect(csv).toMatch(/^elfo-recurso-001,Elfo Recurso,Elfo,Recurso,.*referencias\/elfos-recursos-001\(ref\)\.png/m);
  expect(csv).toMatch(/^enano-lugar-001,Enano Lugar,Enano,Lugar,/m);
  expect(await readFolderFile(page, 'clases', 'assets/referencias/elfos-recursos-001(ref).png')).not.toBeNull();
  const project = JSON.parse((await readFolderFile(page, 'clases', 'proyecto.json'))!);
  expect(Object.keys(project.templates)).toEqual(expect.arrayContaining(['elfo ataque', 'orco ataque', 'enano recurso']));

  // En el editor: la Tabla y el detalle de la carta enseñan la referencia.
  await page.getByRole('button', { name: '4 · Tabla' }).click();
  await page.getByLabel('id, fila 4').click();
  await expect(page.locator('.table-view figure.ref img')).toBeVisible();
  await page.getByRole('button', { name: '5 · Cartas' }).click();
  await page.locator('main .thumb').nth(3).click();
  await expect(page.locator('.dialog figure.ref img')).toBeVisible();

  expect(errors).toEqual([]);
});

test('grupo y subgrupo desde «clan-energy-N», y otro subgrupo del mismo grupo en una segunda tanda', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByText('Crear con el asistente').click();
  await next(page);
  const folder = page.locator('input[webkitdirectory]').last();
  const panel = page.locator('.naming');

  await folder.setInputFiles(fixture('grupos', 'tanda1'));
  await expect(panel).toContainText('Crear «Clan · Energy» con 3 cartas');
  await panel.getByRole('button', { name: 'Crear «Clan · Energy» con 3 cartas' }).click();

  // Otra carpeta después: se suma a la primera y va al mismo grupo.
  await folder.setInputFiles(fixture('grupos', 'tanda2'));
  await expect(panel).toContainText('Crear «Clan · Militar» con 1 carta');
  await panel.getByRole('button', { name: 'Crear «Clan · Militar» con 1 carta' }).click();
  await expect(page.locator('.report').first()).toContainText('4 imágenes: 4 en cartas.');

  await next(page);
  const types = await page
    .locator('table.types tbody tr')
    .evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value).join(':')));
  expect(types).toEqual(['Clan:Energy:3', 'Clan:Militar:1']);
  expect(errors).toEqual([]);
});
