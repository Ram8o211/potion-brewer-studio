import { registerIngredientAtlas, ingredientAtlasLoaded } from '../visual/ingredient-assets.js';

const pending = new Map();
export async function loadIngredientBiome(biome) {
  if (ingredientAtlasLoaded(biome)) return;
  if (pending.has(biome)) return pending.get(biome);
  const task = (async () => {
    const base = new URL(`assets/ingredients/biomes/${biome}`, document.baseURI);
    const response = await fetch(base.href + '.json');
    if (!response.ok) throw new Error(`Ingredient metadata ${biome}: HTTP ${response.status}`);
    const atlas = await response.json();
    const image = new Image(); image.src = base.href + '.png';
    await image.decode();
    if (image.naturalWidth !== atlas.width || image.naturalHeight !== atlas.height) throw new Error('Ingredient PNG dimensions mismatch: ' + biome);
    const cv = document.createElement('canvas'); cv.width = atlas.width; cv.height = atlas.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    registerIngredientAtlas(atlas, ctx.getImageData(0, 0, cv.width, cv.height).data);
  })();
  pending.set(biome, task);
  try { await task; } finally { pending.delete(biome); }
}

export async function loadGameIngredients(st, all = false) {
  const biomes = new Set(all ? st.world.materials.filter((m) => m.wild).map((m) => m.wild.region) : st.unlockedBiomes);
  // Migrated discoveries, items and propagules may belong to a still-locked biome.
  for (const [id, amount] of [...Object.entries(st.inventory), ...Object.entries(st.garden.seeds), ...Object.entries(st.found)]) if (Number(amount) > 0 && st.lookup(id)?.wild) biomes.add(st.lookup(id).wild.region);
  for (const p of st.garden.plots) if (p.crop && st.lookup(p.crop.materialId)?.wild) biomes.add(st.lookup(p.crop.materialId).wild.region);
  await Promise.all([...biomes].map(loadIngredientBiome));
}
