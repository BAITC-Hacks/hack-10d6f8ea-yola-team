import { seedData } from './data.js';
const KEY = 'sana-hub-v1';
export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      data.profiles ||= { business: null, student: null };
      data.currentRole ||= null;
      data.tasks = (data.tasks || []).map((task) => {
        const seeded = seedData.tasks.find((item) => item.id === task.id);
        return { ...task, company: task.company || seeded?.company || '', industry: task.industry || seeded?.industry || '' };
      });
      return data;
    }
  } catch { /* reset malformed demo data */ }
  const data = { ...structuredClone(seedData), profiles: { business: null, student: null }, currentRole: null };
  saveStore(data);
  return data;
}
export function saveStore(store) { localStorage.setItem(KEY, JSON.stringify(store)); }
export function resetStore() { localStorage.removeItem(KEY); return loadStore(); }
