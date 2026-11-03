import {test, expect} from '@playwright/test';
import {watchErrors} from './helpers.mjs';
async function open(page, workspace){await page.goto('/?nosw');await page.locator('[data-act=art-studio]').click();await page.getByLabel('Editor workspace',{exact:true}).selectOption(workspace);await page.locator('[data-domain]').waitFor();}
async function field(page,label,value){const f=page.getByLabel(label,{exact:true});await f.fill(String(value));await f.press('Tab');}
const state=(page,fn)=>page.evaluate(fn);
test('native ingredient editor binds graphs and extracts editable geometry',async({page})=>{
 const errors=watchErrors(page);await open(page,'ingredients');await page.getByLabel('Domain target',{exact:true}).selectOption('silverleaf');
 await page.locator('[data-act=domain-bind-species]').click();
 expect(await state(page,()=>window.__alchemist.screen.project.domains.ingredients.silverleaf.asset)).toBeTruthy();
 await page.getByLabel('Game construction',{exact:true}).selectOption('');
 await page.locator('[data-act=domain-extract-native]').click();await expect(page.locator('.art-canvas')).toBeVisible();await expect(page.getByLabel('Editor workspace',{exact:true})).toHaveValue('components');
 expect(await state(page,()=>window.__alchemist.screen.component.geometry.length+window.__alchemist.screen.component.layers[0].pixels.filter(Boolean).length)).toBeGreaterThan(0);
 expect(errors).toEqual([]);
});
test('terrain edits are structural, undoable and portable',async({page})=>{
 const errors=watchErrors(page);await open(page,'environments');await page.getByLabel('Domain target',{exact:true}).selectOption('forest');
 const cv=page.locator('.art-domain-canvas'),b=await cv.boundingBox();await page.mouse.click(b.x+b.width*.3,b.y+b.height*.2);
 await expect.poll(()=>state(page,()=>window.__alchemist.screen.project.domains.environments.forest.strokes.length)).toBe(1);
 await expect.poll(()=>state(page,()=>window.__alchemist.screen.domainEditor.scene?.solid[43*384+115])).toBe(1);
 await page.locator('[data-act=art-save]').click();await expect(page.locator('.art-status')).toContainText('Draft saved');
 await page.reload();await page.locator('[data-act=art-studio]').click();await page.getByLabel('Editor workspace',{exact:true}).selectOption('environments');await page.getByLabel('Domain target',{exact:true}).selectOption('forest');
 expect(await state(page,()=>window.__alchemist.screen.project.domains.environments.forest.strokes.length)).toBe(1);expect(errors).toEqual([]);
});
test('creature anatomy, pose keys, mutations and animation use the real renderer',async({page})=>{
 const errors=watchErrors(page);await open(page,'creatures');await field(page,'Anatomy: head',1.2);await page.getByLabel('Mutation preview',{exact:true}).selectOption('wings');
 await page.getByLabel('Animation pose',{exact:true}).selectOption('hop');await field(page,'Pose key: headX',2);
 expect(await state(page,()=>window.__alchemist.screen.project.domains.creatures.rabbit.poses.hop.headX)).toBe(2);
 await page.waitForTimeout(250);expect(errors).toEqual([]);
});
test('material, magical effect and UI workspaces persist real visual settings',async({page})=>{
 const errors=watchErrors(page);await open(page,'materials');await page.getByLabel('Domain target',{exact:true}).selectOption('gas');await field(page,'Opacity',.5);
 await expect.poll(()=>state(page,()=>window.__alchemist.screen.domainEditor.renderer.canvas===window.__alchemist.screen.domainEditor.canvas)).toBe(true);
 await page.getByLabel('Material/effect tint',{exact:true}).fill('#ff0000');await page.getByLabel('Material/effect tint',{exact:true}).press('Tab');await field(page,'Tint strength',1);
 expect(await state(page,()=>{const data=window.__alchemist.screen.domainEditor.renderer.fluid.image.data;let red=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>10&&data[i]>data[i+1]+40)red++;return red;})).toBeGreaterThan(0);
 await page.getByLabel('Editor workspace',{exact:true}).selectOption('effects');await page.getByLabel('Domain target',{exact:true}).selectOption('fire');await field(page,'Particle density',2);await page.getByLabel('Particle shape',{exact:true}).selectOption('cross');
 await page.waitForTimeout(400);await page.getByLabel('Editor workspace',{exact:true}).selectOption('interface');await page.getByLabel('Enable interface profile',{exact:true}).check();
 const id=await state(page,()=>window.__alchemist.screen.asset.id);await page.getByLabel('frame artwork',{exact:true}).selectOption(id);await page.getByLabel('Icon artwork',{exact:true}).selectOption(id);
 await page.locator('.art-project-menu > summary').click();await page.locator('[data-act=art-apply]').click();await expect(page.locator('.art-status')).toContainText('Art profile applied');
 await page.locator('[data-act=art-exit]').click();await expect(page.locator('#custom-art-profile')).toBeAttached();
 await page.locator('[data-act=art-studio]').click();await page.locator('.art-project-menu > summary').click();await page.locator('[data-act=art-revert]').click();await expect(page.locator('#custom-art-profile')).toHaveCount(0);expect(errors).toEqual([]);
});


test('Wilds inspector controls remain reachable on short and narrow screens', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?nosw');
  await page.locator('[data-act=art-studio]').click();
  // A previously hidden panel must not silently hide Wilds authoring controls.
  await page.locator('[data-act=art-toggle-inspector]').click();
  await expect(page.locator('.art-inspector')).toBeHidden();
  await page.getByLabel('Editor workspace', { exact: true }).selectOption('environments');
  const inspector = page.locator('.art-inspector');
  await expect(inspector).toBeVisible();
  await expect(page.getByLabel('Terrain tool', { exact: true })).toBeVisible();
  await page.getByLabel('Terrain tool', { exact: true }).selectOption('light');
  const cv = page.locator('.art-domain-canvas');
  await cv.scrollIntoViewIfNeeded();
  const bounds = await cv.boundingBox();
  await page.mouse.click(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.4);
  const deepField = page.getByLabel('Light strength 0', { exact: true });
  await deepField.scrollIntoViewIfNeeded();
  expect(await inspector.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await deepField.fill('1.1');
  await deepField.press('Tab');
  expect(await inspector.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByLabel('Light strength 0', { exact: true })).toHaveValue('1.1');
  await page.locator('[data-act=art-save]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-act=art-save]')).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 680 });
  await expect(inspector).toBeVisible();
  const width = await inspector.evaluate(el => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(320);
  const appearance = page.getByLabel('Atmospheric density', { exact: true });
  await appearance.scrollIntoViewIfNeeded();
  await expect(appearance).toBeInViewport();
  await page.locator('[data-editor-group="wilds-advanced"] > summary').click();
  await page.locator('[data-act=domain-clear-terrain]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-act=domain-clear-terrain]')).toBeInViewport();
  await page.locator('[data-act=art-exit]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-act=art-exit]')).toBeInViewport();
  expect(errors).toEqual([]);
});


test('Wilds painting tools are direct, contextual and reversible', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'environments');
  const palette = page.getByRole('toolbar', { name: 'Wilds painting tools' });
  await expect(palette).toBeVisible();
  for (const tool of ['rock', 'soil', 'erase', 'water', 'lava', 'place', 'light']) {
    await expect(page.locator('[data-act=domain-tool-' + tool + ']')).toBeVisible();
  }
  await page.locator('[data-act=domain-tool-place]').click();
  await expect(page.getByLabel('Placement asset', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Terrain brush radius', { exact: true })).toHaveCount(0);
  await page.locator('[data-act=domain-tool-rock]').click();
  await expect(page.getByLabel('Terrain brush radius', { exact: true })).toBeVisible();
  const canvas = page.locator('.art-domain-canvas');
  const b = await canvas.boundingBox();
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.2);
  await expect.poll(() => state(page, () => window.__alchemist.screen.project.domains.environments.meadow.strokes.length)).toBe(1);
  await page.locator('[data-act=domain-undo]').click();
  await expect.poll(() => state(page, () => window.__alchemist.screen.project.domains.environments.meadow.strokes.length)).toBe(0);
  await page.locator('[data-act=domain-redo]').click();
  await expect.poll(() => state(page, () => window.__alchemist.screen.project.domains.environments.meadow.strokes.length)).toBe(1);
  await page.locator('[data-editor-group="wilds-advanced"] > summary').click();
  await page.locator('[data-act=domain-clear-terrain]').click();
  await expect(page.getByRole('dialog', { name: 'Clear painted terrain?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await state(page, () => window.__alchemist.screen.project.domains.environments.meadow.strokes.length)).toBe(1);
  await page.locator('[data-act=domain-clear-terrain]').click();
  await page.getByRole('button', { name: 'Clear terrain', exact: true }).click();
  await expect.poll(() => state(page, () => window.__alchemist.screen.project.domains.environments.meadow.strokes.length)).toBe(0);
  await page.locator('[data-act=art-help]').click();
  await expect(page.getByRole('dialog', { name: 'Art Studio guide' })).toContainText('Choose a biome');
  expect(errors).toEqual([]);
});


test('Wilds props and lights expose draggable position and size handles', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'environments');
  await page.getByLabel('Domain target', { exact: true }).selectOption('forest');
  const preview = page.locator('.art-domain-canvas');
  const at = (x, y) => page.evaluate(([x, y]) => {
    const b = document.querySelector('.art-domain-canvas').getBoundingClientRect();
    return { x: b.left + x * b.width / 384, y: b.top + y * b.height / 216 };
  }, [x, y]);
  await page.locator('[data-act=domain-tool-light]').click();
  const drop = await at(95, 70);
  await preview.scrollIntoViewIfNeeded();
  await page.mouse.click(drop.x, drop.y);
  await expect.poll(() => page.evaluate(() => window.__alchemist.screen.project.domains.environments.forest.lights.length)).toBe(1);
  await expect(page.locator('[data-act=domain-tool-select]')).toHaveAttribute('aria-pressed', 'true');
  const moved = await at(125, 82);
  await page.mouse.move(drop.x, drop.y);
  await page.mouse.down();
  await page.mouse.move(moved.x, moved.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__alchemist.screen.project.domains.environments.forest.lights[0].x)).toBe(125);
  await page.locator('[data-act=domain-undo]').click();
  await expect.poll(() => page.evaluate(() => window.__alchemist.screen.project.domains.environments.forest.lights[0].x)).toBe(95);
  await page.locator('[data-act=domain-redo]').click();
  await expect.poll(() => page.evaluate(() => window.__alchemist.screen.project.domains.environments.forest.lights[0].x)).toBe(125);
  const handle = await at(160, 82), enlarged = await at(175, 82);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(enlarged.x, enlarged.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__alchemist.screen.project.domains.environments.forest.lights[0].radius)).toBe(50);
  await page.locator('[data-act=domain-tool-place]').click();
  const prop = await at(230, 120);
  await page.mouse.click(prop.x, prop.y);
  await expect.poll(() => page.evaluate(() => window.__alchemist.screen.project.domains.environments.forest.objects.length)).toBe(1);
  const before = await page.evaluate(() => window.__alchemist.screen.project.domains.environments.forest.objects[0].scale);
  const propHandle = await at(230 + 20 * before, 120 - 20 * before);
  const grow = await at(230 + 20 * before + 6, 120 - 20 * before);
  await page.mouse.move(propHandle.x, propHandle.y);
  await page.mouse.down();
  await page.mouse.move(grow.x, grow.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__alchemist.screen.project.domains.environments.forest.objects[0].scale)).toBe(1.3);
  expect(errors).toEqual([]);
});
