export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function requestJson(path, options = {}) {
  const headers = { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  let response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...options, headers });
  } catch {
    throw new ApiError(0, 'Сервер недоступен. Проверьте подключение и повторите действие.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.error || 'Запрос не выполнен.', body.details);
  return body;
}

export const newIdempotencyKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const api = {
  auth: () => requestJson('/api/auth/me'),
  register: (input) => requestJson('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input) => requestJson('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => requestJson('/api/auth/logout', { method: 'POST', body: '{}' }),
  saveProfile: (input) => requestJson('/api/auth/profile', { method: 'PUT', body: JSON.stringify(input) }),
  catalog: (filters = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value && value !== 'all'));
    return requestJson(`/api/tasks${query.size ? `?${query}` : ''}`);
  },
  task: (id) => requestJson(`/api/tasks/${encodeURIComponent(id)}`),
  myTasks: () => requestJson('/api/me/tasks'),
  createTask: (input, key) => requestJson('/api/tasks', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
  workflow: (id) => requestJson(`/api/tasks/${encodeURIComponent(id)}/workflow`),
  saveWorkflow: (id, input) => requestJson(`/api/tasks/${encodeURIComponent(id)}/workflow`, { method: 'PUT', body: JSON.stringify(input) }),
  analyze: (id, version) => requestJson('/api/ai/analyze', { method: 'POST', body: JSON.stringify({ taskId: id, version }) }),
  publish: (id, input, key) => requestJson(`/api/tasks/${encodeURIComponent(id)}/publish`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
  myProposals: () => requestJson('/api/me/proposals'),
  createProposal: (taskId, input, key) => requestJson(`/api/tasks/${encodeURIComponent(taskId)}/proposals`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
  decideProposal: (id, input) => requestJson(`/api/proposals/${encodeURIComponent(id)}/decision`, { method: 'PATCH', body: JSON.stringify(input) }),
};

export function exportLegacyBrowserData() {
  const data = {
    exportedAt: new Date().toISOString(),
    source: 'Sana Hub legacy browser store',
    'sana-hub-v2': localStorage.getItem('sana-hub-v2'),
    'sana-hub-v1': localStorage.getItem('sana-hub-v1'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `sana-hub-legacy-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
