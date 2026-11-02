// Pure-generation microbenchmark. Run independently of gameplay timings.
import { newProject, newNode } from '../src/studio/model.js';
import { generate } from '../src/studio/engine.js';
const asset = newProject().assets[0];
for (let i = 0; i < 12; i++) { const n = newNode(asset.components[1].id, asset.nodes[0].id); n.count = 10; n.spread = 6; n.jitter = 50; n.y = i * -2; n.scale = 0.5; asset.nodes.push(n); }
for (let i = 0; i < 10; i++) generate(asset, i);
const samples = []; let instances = 0;
for (let i = 0; i < 100; i++) { const t = performance.now(); const result = generate(asset, i); samples.push(performance.now() - t); instances = result.instances.length; }
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ node: process.version, canvas: '96×96', instances, iterations: samples.length, medianMs: +samples[50].toFixed(3), p95Ms: +samples[95].toFixed(3) }, null, 2));
