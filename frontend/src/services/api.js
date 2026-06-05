// api.js — thin client over cbqManager's JWT REST API. ColdBox owns all logic; this just
// carries the bearer token and shapes requests. The environment switcher sets the base URL
// (one cbqManager host per environment, or a single host with many Connections).

const TOKEN_KEY = 'cbqm_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}
export function setToken(t) {
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)
}

async function request(method, path, { body, params } = {}) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`/api${path}${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error(json?.messages?.join(', ') || res.statusText), { status: res.status, json })
  }
  return json
}

export const api = {
  // auth
  login: (username, password) => request('POST', '/login', { body: { username, password } }),
  logout: () => request('POST', '/logout'),

  // connections (admin)
  listConnections: () => request('GET', '/connections'),
  getConnection: (id) => request('GET', `/connections/${id}`),
  createConnection: (data) => request('POST', '/connections', { body: data }),
  updateConnection: (id, data) => request('PUT', `/connections/${id}`, { body: data }),
  deleteConnection: (id) => request('DELETE', `/connections/${id}`),

  // realtime (Live Monitor) — public broadcast config for a Connection (never the secret)
  connectionBroadcast: (cid) => request('GET', `/connections/${cid}/broadcast`),

  // queue health + jobs
  queueHealth: (cid) => request('GET', `/connections/${cid}/health`),
  listJobs: (cid, params) => request('GET', `/connections/${cid}/jobs`, { params }),
  nextUp: (cid, params) => request('GET', `/connections/${cid}/jobs/nextup`, { params }),
  jobComplete: (cid, id) => request('POST', `/connections/${cid}/jobs/${id}/complete`),
  jobReset: (cid, id) => request('POST', `/connections/${cid}/jobs/${id}/reset`),
  jobQuarantine: (cid, id, toQueue) => request('POST', `/connections/${cid}/jobs/${id}/quarantine`, { body: { toQueue } }),
  jobDelete: (cid, id) => request('DELETE', `/connections/${cid}/jobs/${id}`),

  // queue-wide control
  heal: (cid, queue) => request('POST', `/connections/${cid}/heal`, { body: { queue } }),
  park: (cid, queue) => request('POST', `/connections/${cid}/park`, { body: { queue } }),
  release: (cid, body) => request('POST', `/connections/${cid}/release`, { body }),
  discard: (cid, body) => request('POST', `/connections/${cid}/discard`, { body }),

  // failed jobs
  listFailed: (cid, params) => request('GET', `/connections/${cid}/failed-jobs`, { params }),
  retryFailed: (cid, id, deleteAfter) => request('POST', `/connections/${cid}/failed-jobs/${id}/retry`, { body: { deleteAfter } }),
  deleteFailed: (cid, id) => request('DELETE', `/connections/${cid}/failed-jobs/${id}`),

  // batches
  listBatches: (cid, params) => request('GET', `/connections/${cid}/batches`, { params }),
  cancelBatch: (cid, batchId) => request('POST', `/connections/${cid}/batches/${batchId}/cancel`),
  retryBatchFailed: (cid, batchId) => request('POST', `/connections/${cid}/batches/${batchId}/retry-failed`),
  batchJobs: (cid, batchId) => request('GET', `/connections/${cid}/batches/${batchId}/jobs`),
  deleteBatch: (cid, batchId) => request('DELETE', `/connections/${cid}/batches/${batchId}`),

  // archive + audit
  archive: (cid, params) => request('GET', `/connections/${cid}/archive`, { params }),
  audit: (params) => request('GET', '/audit', { params })
}
