// Explicit scenarios: a campaign shop, a collector with stock from unlocked
// biomes, or the legacy growth engine retained by sandbox and cultivation.
import { GameState } from '../src/game/state.js';
import { BIOMES } from '../src/game/biomes.js';
import { generateDeposits, createGathering } from '../src/game/gathering.js';

export function collectedShop(st, rank = st.rank) {
  st.stats.served = Math.max(st.stats.served, rank * 10);
  st.unlockedBiomes = BIOMES.filter((b) => b.rank <= rank && b.sales <= st.stats.served).map((b) => b.id);
  for (const m of st.world.materials) if (m.wild && !m.product && m.wild.rank <= rank && st.unlockedBiomes.includes(m.wild.region)) st.inventory[m.id] = st.cap.storage;
  st._deposits = null;
  return st;
}

export function growthSandbox(seed = 'gather-1') {
  const st = GameState.create(seed, { tutorial: false });
  const deposits = generateDeposits(st.world, st.lookup);
  Object.defineProperty(st, 'deposits', { value: deposits });
  st.unlockedBiomes = BIOMES.map((b) => b.id);
  st.gathering = createGathering();
  return st;
}
