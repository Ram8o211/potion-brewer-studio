import { artInterface, onArtChanged } from './direction.js';
import { assetPixels } from './asset-runtime.js';
export function interfaceIcon(name, size) {
  const id = artInterface()?.icons[name];
  return id ? assetPixels(id, 1, 2, size, size)?.toCanvas().toDataURL() || null : null;
}
export function interfaceDecoration(config, type) {
  const id = config?.[type];
  const image = id && assetPixels(id, 1, 2, 32, 32);
  return image ? `url("${image.toCanvas().toDataURL()}") 8 fill / ${config.border || 1}px / 0 stretch` : '';
}
export function refreshArtUI() {
  if (typeof document === 'undefined') return;
  let style = document.getElementById('custom-art-profile');
  const c = artInterface();
  if (!c) { style?.remove(); return; }
  if (!style) { style = document.createElement('style'); style.id = 'custom-art-profile'; document.head.append(style); }
  const root = '.screen:not(.art-studio)';
  style.textContent = `${root} .frame,${root} .card{background-color:${c.panel};color:${c.ink};border-color:${c.accent};${c.frame ? `border-image:${interfaceDecoration(c, 'frame')};` : ''}}
    ${root} .btn{background-color:${c.accent};color:${c.ink};transition:filter ${c.duration}ms;${c.button ? `border-image:${interfaceDecoration(c, 'button')};` : ''}}
    ${root} .btn:hover{filter:brightness(1.15)}${root} .btn:active{filter:brightness(.8)}${root} .btn:disabled{filter:saturate(.2);opacity:.6}`;
}
onArtChanged(refreshArtUI);
