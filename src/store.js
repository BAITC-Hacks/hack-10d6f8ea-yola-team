import { seedData } from './data.js';
const KEY = 'sana-hub-v1';
export function loadStore() { try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* reset malformed demo data */ } saveStore(seedData); return structuredClone(seedData); }
export function saveStore(store) { localStorage.setItem(KEY, JSON.stringify(store)); }
export function resetStore() { localStorage.removeItem(KEY); return loadStore(); }
