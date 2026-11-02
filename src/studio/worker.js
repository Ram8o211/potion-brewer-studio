// Pure environment authoring worker; bundled and precached with the game.
import { setArtDirection } from './direction.js';
import { composeScene } from '../visual/env/scene.js';
const channel = /** @type {any} */ (globalThis);
channel.onmessage = ({ data }) => {
  try {
    setArtDirection(data.profile);
    const s = composeScene(data.region, String(data.seed));
    channel.postMessage({ key: data.key, w: s.pix.w, h: s.pix.h, data: s.pix.data, solid: s.solid, open: s.open, meta: s.meta }, [s.pix.data.buffer, s.solid.buffer, s.open.buffer]);
  } catch (e) { channel.postMessage({ key: data.key, error: e.message || String(e) }); }
};
