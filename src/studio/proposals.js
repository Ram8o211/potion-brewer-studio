// Provider-neutral structured art changes. No model endpoint, credentials or code execution.
import { upgradeProject, clone } from './model.js';
export async function projectDigest(project) {
  const bytes = new TextEncoder().encode(JSON.stringify(project));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
export async function makeProposal(current, candidate) {
  return { format: 'potion-art-proposal', version: 1, base: await projectDigest(current), project: upgradeProject(candidate) };
}
export async function reviewProposal(current, proposal) {
  if (proposal?.format !== 'potion-art-proposal' || proposal.version !== 1 || proposal.base !== await projectDigest(current)) throw new Error('Art proposal is incompatible or based on an older draft. Save and request a fresh proposal.');
  const candidate = upgradeProject(proposal.project), changes = [];
  const walk = (a, b, path) => {
    if (changes.length > 500) return;
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], path + '/' + k);
    else changes.push({ path, before: JSON.stringify(a)?.slice(0, 200), after: JSON.stringify(b)?.slice(0, 200) });
  };
  walk(current, candidate, '');
  return { candidate: clone(candidate), changes };
}
