import { validateProject, clone, upgradeProject } from './model.js';
const DB = 'potion-art-studio';
/** Open per transaction; no global handle survives a screen's lifecycle. */
async function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('projects', { keyPath: 'id' }); r.result.createObjectStore('settings'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Art storage is unavailable'));
    r.onblocked = () => reject(new Error('Close other Studio tabs to upgrade art storage'));
  });
}
async function transaction(store, mode, action) {
  const db = /** @type {IDBDatabase} */ (await open());
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), request = action(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not save art project; export a backup')); };
  });
}
export async function listProjects() {
  const db = /** @type {IDBDatabase} */ (await open());
  return new Promise((resolve, reject) => {
    const rows = [], tx = db.transaction('projects', 'readonly');
    const request = tx.objectStore('projects').openCursor();
    request.onsuccess = () => { const cursor = request.result; if (!cursor) return; const p = cursor.value; rows.push({ id: p.id, name: p.name, updated: p.updated }); cursor.continue(); };
    tx.oncomplete = () => { db.close(); resolve(rows); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not list art projects')); };
  });
}
export const loadProject = (id) => transaction('projects', 'readonly', (s) => s.get(id)).then((p) => p ? upgradeProject(p) : null);
export async function saveProject(p) { validateProject(p); const data = clone(p); data.updated = Date.now(); await transaction('projects', 'readwrite', (s) => s.put(data)); return data; }
export const deleteProject = (id) => transaction('projects', 'readwrite', (s) => s.delete(id));
export const getSetting = (key) => transaction('settings', 'readonly', (s) => s.get(key));
export const putSetting = (key, value) => transaction('settings', 'readwrite', (s) => s.put(value, key));
