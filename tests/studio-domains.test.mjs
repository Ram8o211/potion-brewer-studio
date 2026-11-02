import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, compileProfile, upgradeProject, validateProject } from '../src/studio/model.js';
import { environmentStyle, creatureStyle, visualStyle } from '../src/studio/domain-model.js';
import { setArtDirection, artDirection, withArtProfile } from '../src/studio/direction.js';
import { archetypeIdentity, pieceMask } from '../src/visual/pieces.js';
import { describe } from '../src/visual/descriptor.js';
import { plantFrame, iconFrame, pieceFrame } from '../src/visual/render.js';
import { sceneOf } from '../src/visual/env/scene.js';
import { rabbitAnchors } from '../src/rendering/rabbit.js';
import { rollLook } from '../src/game/colony.js';
import { Rng } from '../src/core/rng.js';
import { directMaterialImage } from '../src/studio/material-runtime.js';
import { Simulation } from '../src/simulation/world.js';
import { REF, refLookup } from '../src/materials/reference.js';

test('version 1 projects migrate all domain documents without changing artwork', () => {
  const p = newProject(); delete p.domains; p.version = 1; const a = JSON.stringify(p.assets);
  const migrated = upgradeProject(p); assert.equal(migrated.version, 2); assert.equal(JSON.stringify(migrated.assets), a); validateProject(migrated);
  migrated.domains.environments.forest = { ...environmentStyle(), strokes: [{kind:'rock',color:'#ffffff',radius:8,points:[[900,20]]}] };
  assert.throws(() => validateProject(migrated), /terrain point/);
});
test('custom graphs replace all growth stages and icon-derived physical fragments in the game', () => {
  setArtDirection(null); const id=archetypeIdentity('silverleaf'), original=iconFrame(describe(id)).pix.hash();
  const p=newProject();p.domains.ingredients.silverleaf={morph:{},growth:{},asset:p.assets[0].id};setArtDirection(compileProfile(p));
  const d=describe(id);assert.notEqual(iconFrame(d).pix.hash(),original);
  for(let stage=0;stage<3;stage++) {const f=plantFrame(d,stage);assert.ok(f.pix.px.some(c=>c>>>24));assert.ok(Number.isInteger(f.ax));}
  for(let v=0;v<4;v++)assert.ok(pieceFrame(d,v).mask.some(Boolean));
  assert.ok(pieceMask('silverleaf',0).some(Boolean));setArtDirection(null);assert.equal(iconFrame(describe(id)).pix.hash(),original);
});
test('terrain painting updates structural metadata and scene cache revisions', () => {
  setArtDirection(null);const baseline=sceneOf('forest','domain');const k=30*384+100;
  const p=newProject();p.domains.environments.forest={...environmentStyle(),strokes:[{kind:'rock',color:'#885544',radius:6,points:[[100,30]]}]};setArtDirection(compileProfile(p));
  const edited=sceneOf('forest','domain');assert.notEqual(edited,baseline);assert.equal(edited.solid[k],1);assert.equal(edited.open[k],0);assert.equal(edited.rock[k],1);
  p.domains.environments.forest.strokes=[{kind:'erase',color:'#885544',radius:6,points:[[100,30]]}];setArtDirection(compileProfile(p));assert.equal(sceneOf('forest','domain').solid[k],0);setArtDirection(null);
});
test('creature anatomy uses native anchor relationships while preserving the foot and frame contract', () => {
 const look=rollLook(new Rng(42)), snap={alive:true,stage:'adult',hp:0,lv:Array(10).fill(0),traits:[],sc:Array(11).fill(0)};
 setArtDirection(null);const before=rabbitAnchors(look,snap,'idle');const p=newProject();p.domains.creatures.rabbit={...creatureStyle(),head:1.2,ears:.8,poses:{idle:{headX:1,headY:-1,ear:0}}};setArtDirection(compileProfile(p));
 const after=rabbitAnchors(look,snap,'idle');assert.ok(after.head.rx>before.head.rx);assert.equal(after.feetY,before.feetY);assert.equal(after.eye.x,before.eye.x+1);setArtDirection(null);
});
test('material art changes output RGBA without changing any simulation fields', () => {
 const sim=new Simulation({size:'small',lookup:refLookup});sim.emitter.start(REF.water,{amount:10,x:0});for(let i=0;i<40;i++)sim.step();
 const before=JSON.stringify({x:Array.from(sim.p.x),rho:Array.from(sim.p.rho),temp:Array.from(sim.p.temp)});
 const p=newProject();p.domains.materials.liquid={...visualStyle(),tint:'#ff0000',mix:1,opacity:.5};setArtDirection(compileProfile(p));const image=new Uint8ClampedArray([0,100,200,255]);directMaterialImage(image,1,()=> 'liquid',0);
 assert.equal(image[0],255);assert.equal(image[1],0);assert.equal(image[3],128);assert.equal(JSON.stringify({x:Array.from(sim.p.x),rho:Array.from(sim.p.rho),temp:Array.from(sim.p.temp)}),before);setArtDirection(null);
});
test('editor rendering scope cannot leak a draft into the applied profile', () => {
 setArtDirection(null);const profile=compileProfile(newProject());withArtProfile(profile,-123,()=>assert.ok(artDirection()));assert.equal(artDirection(),null);
 assert.throws(()=>withArtProfile(profile,-123,()=>{throw Error('preview');}));assert.equal(artDirection(),null);
});

test('structured proposals show a diff and reject stale drafts before acceptance', async () => {
 const {makeProposal, reviewProposal}=await import('../src/studio/proposals.js');
 const before=newProject(), candidate=structuredClone(before);candidate.direction.global.tint='#223344';
 const proposal=await makeProposal(before,candidate), review=await reviewProposal(before,proposal);
 assert.ok(review.changes.some(c=>c.path==='/direction/global/tint'));assert.equal(before.direction.global.tint,'#ffffff');
 before.name='Changed while waiting';await assert.rejects(()=>reviewProposal(before,proposal),/older draft/);
});

test('custom constructions retain ground, hanging and mirrored wall attachment conventions', () => {
 const p=newProject();p.domains.ingredients.silverleaf={morph:{},growth:{},asset:p.assets[0].id};setArtDirection(compileProfile(p));
 const d=describe(archetypeIdentity('silverleaf'));
 const ground=plantFrame(d,2),hanging=plantFrame(d,2,{mount:'hang'}),wall=plantFrame(d,2,{mount:'wall'}),flip=plantFrame(d,2,{mount:'wall',flip:true});
 assert.equal(hanging.ay,0);assert.equal(ground.ay,ground.pix.h-1);assert.equal(wall.ax,0);assert.equal(flip.ax,flip.pix.w-1);
 for(let y=0;y<wall.pix.h;y++)for(let x=0;x<wall.pix.w;x++)assert.equal(wall.pix.get(x,y),flip.pix.get(flip.pix.w-1-x,y));
 setArtDirection(null);
});

test('localized environment lights change pixels while preserving collision and attachment masks', () => {
 setArtDirection(null);const base=sceneOf('forest','lights');const p=newProject();p.domains.environments.forest={...environmentStyle(),lights:[{x:120,y:40,radius:50,color:'#ff3300',strength:1.5}]};
 setArtDirection(compileProfile(p));const lit=sceneOf('forest','lights');assert.notEqual(lit.pix.hash(),base.pix.hash());assert.deepEqual(lit.solid,base.solid);assert.deepEqual(lit.open,base.open);setArtDirection(null);
});
