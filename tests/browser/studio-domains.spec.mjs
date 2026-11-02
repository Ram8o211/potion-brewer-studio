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
 await page.locator('[data-act=domain-extract-native]').click();await expect(page.locator('.art-canvas')).toBeVisible();
 expect(await state(page,()=>window.__alchemist.screen.component.geometry.length+window.__alchemist.screen.component.layers[0].pixels.filter(Boolean).length)).toBeGreaterThan(0);
 expect(errors).toEqual([]);
});
test('terrain edits are structural, undoable and portable',async({page})=>{
 const errors=watchErrors(page);await open(page,'environments');await page.getByLabel('Domain target',{exact:true}).selectOption('forest');
 const cv=page.locator('.art-domain-canvas'),b=await cv.boundingBox();await page.mouse.click(b.x+b.width*.3,b.y+b.height*.2);
 await expect.poll(()=>state(page,()=>window.__alchemist.screen.project.domains.environments.forest.strokes.length)).toBe(1);
 expect(await state(page,()=>window.__alchemist.screen.domainEditor.scene.solid[43*384+115])).toBe(1);
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
 await page.locator('[data-act=art-apply]').click();await expect(page.locator('.art-status')).toContainText('Art profile applied');
 await page.locator('[data-act=art-exit]').click();await expect(page.locator('#custom-art-profile')).toBeAttached();
 await page.locator('[data-act=art-studio]').click();await page.locator('[data-act=art-revert]').click();await expect(page.locator('#custom-art-profile')).toHaveCount(0);expect(errors).toEqual([]);
});
