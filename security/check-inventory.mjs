#!/usr/bin/env node
// IDA Shield: fail-closed inventory and baseline gate. No network access or secrets.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventoryPath = path.join(root, 'security/sites.json');
const errors = [];
let data;
try { data = JSON.parse(readFileSync(inventoryPath, 'utf8')); }
catch (e) { console.error('IDA_SHIELD_FAIL: inventory unavailable:', e.message); process.exit(1); }
if (data.schemaVersion !== 1 || !Array.isArray(data.sites) || data.sites.length === 0) errors.push('invalid inventory schema');
const ids = new Set(), origins = new Set();
for (const s of data.sites || []) {
  if (!s.id || ids.has(s.id)) errors.push('duplicate/missing id: ' + s.id);
  ids.add(s.id);
  if (!['production','preview','prototype'].includes(s.environment)) errors.push('invalid environment: ' + s.id);
  if (!['static','web'].includes(s.kind)) errors.push('invalid kind: ' + s.id);
  if (!s.owner || !s.renderServiceId || !s.repo) errors.push('missing owner/service/repo: ' + s.id);
  try {
    const u = new URL(s.origin);
    if (u.protocol !== 'https:' || !u.hostname.endsWith('.onrender.com') || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error();
    if (origins.has(u.origin)) errors.push('duplicate origin: ' + s.id);
    origins.add(u.origin);
  } catch { errors.push('invalid origin: ' + s.id); }
  if (s.dataClass !== 'unknown' && !['public','personal','confidential'].includes(s.dataClass)) errors.push('invalid dataClass: ' + s.id);
  if (!['unverified','verified'].includes(s.originLock)) errors.push('originLock missing: ' + s.id);
  if (s.originLock === 'verified' && !s.evidence) errors.push('origin lock requires evidence: ' + s.id);
}
if (errors.length) { for (const e of errors) console.error('IDA_SHIELD_FAIL:', e); process.exit(1); }
const unverified = data.sites.filter(s => s.originLock !== 'verified');
console.log('IDA Shield inventory:', data.sites.length, 'sites; unverified origin locks:', unverified.length);
console.log('Inventory syntax: PASS. Production security readiness:', unverified.length ? 'NOT VERIFIED' : 'REQUIRES ADDITIONAL TESTS');
