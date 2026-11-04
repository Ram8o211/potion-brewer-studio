// Keep the physical/magical definitions behind every pre-overhaul item and
// bottle. New species can then use their permanent catalog IDs without silently
// changing a saved potion's composition, activation or recipe.
export function archiveLegacyMaterials(data) {
  const old = (data.world?.materials || []).filter((m) => m.id?.startsWith('wild-') && !m.speciesId);
  if (!old.length) return data;
  const ids = new Map(old.map((m) => [m.id, 'legacy:' + m.id]));
  const rename = (v) => {
    if (typeof v !== 'string') return v;
    if (ids.has(v)) return ids.get(v);
    if (v.endsWith('~a') && ids.has(v.slice(0, -2))) return ids.get(v.slice(0, -2)) + '~a';
    return v;
  };
  const walk = (v) => Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [rename(k), walk(x)])) : rename(v);
  const out = walk(data);
  for (const m of out.world.materials) if (m.id?.startsWith('legacy:')) {
    m.legacy = true;
    m.arcaneVariant = !!(m.arcane && Number.isFinite(m.arcane.thr));
    if (m.arcaneVariant && !m.name.startsWith('Arcane ')) m.name = 'Arcane ' + m.name;
  }
  out.world.catalogVersion = 0;
  out.journal ||= {};
  out.journal['note:arcane-migration'] = { key: 'note:arcane-migration', kind: 'note', title: 'Your earlier ingredients are preserved',
    text: 'Earlier ingredients and potions retain their exact physical and magical properties as legacy finds. Previously awakenable matter is now explicitly Arcane. New discoveries follow the fixed species catalog; ordinary new ingredients cannot awaken.' };
  return out;
}
