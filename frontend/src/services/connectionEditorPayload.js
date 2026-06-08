// Pure payload builders for the Connection editor's save flow. Kept framework-free so the exact
// request shapes (which the backend's sanitize()/sanitizeBroadcast() and the RBAC gate depend on)
// are unit-testable without mounting Quasar. The editor (ConnectionEditor.vue) delegates to these.

/**
 * Build the POST/PUT /api/connections payload from the editor form.
 *
 * Realtime wiring (broadcastConnectionId / channel / events) already flows through the Connection
 * sanitize() allow-list, so we surface it here:
 *   - When a Broadcast Connection is linked, include broadcastConnectionId + the (trimmed) channel
 *     and the events CSV. "No realtime" stays valid: a 0/blank link emits broadcastConnectionId 0
 *     and clears channel/events, so editing a Connection back to no-realtime persists that.
 *   - DB secrets are only sent when provided (so an edit doesn't wipe the stored password).
 *
 * @param {object} form        the editor's reactive form (plain values).
 * @param {boolean} editing    true for an update (omit empty secrets), false for a create.
 * @returns {object} the request body.
 */
export function buildConnectionPayload(form, editing = false) {
  const payload = {
    name: form.name,
    environment: form.environment,
    grammar: form.grammar,
    tableName: form.tableName,
    datasourceClass: form.datasourceClass,
    connectionString: form.connectionString
  }

  // Realtime link. A numeric id > 0 means a Broadcast Connection is selected; anything else is
  // "no realtime" — we still send the (zeroed) link + cleared channel/events so the choice persists.
  const bcId = toBroadcastId(form.broadcastConnectionId)
  if (bcId > 0) {
    payload.broadcastConnectionId = bcId
    payload.channel = (form.channel || '').trim()
    payload.events = (form.events || '').trim()
  } else {
    payload.broadcastConnectionId = 0
    payload.channel = ''
    payload.events = ''
  }

  // DB secrets: only when provided (blank on edit => keep stored password).
  if (form.secrets && (form.secrets.username || form.secrets.password)) {
    payload.secrets = { username: form.secrets.username, password: form.secrets.password }
  }

  return payload
}

/**
 * Build the POST/PUT /api/broadcasts payload for an inline Broadcast Connection create/edit.
 * Only the public params for the chosen transport are sent as columns; the secret struct is sent
 * only when at least one secret field is filled (so a public-only edit keeps the stored secret).
 *
 * @param {object} bform   the inline broadcast sub-form.
 * @returns {object} the request body.
 */
export function buildBroadcastPayload(bform) {
  const transport = bform.transport || 'pusher'
  const payload = { name: (bform.name || '').trim(), transport }

  if (transport === 'pusher') {
    payload.pusherKey = bform.pusherKey || ''
    payload.pusherCluster = bform.pusherCluster || ''
  } else if (transport === 'socketbox') {
    payload.socketboxUrl = bform.socketboxUrl || ''
  }

  const secrets = transport === 'pusher'
    ? { pusherAppId: bform.pusherAppId || '', pusherSecret: bform.pusherSecret || '' }
    : { socketboxAuth: bform.socketboxAuth || '' }
  if (Object.values(secrets).some((v) => v && String(v).length)) {
    payload.secrets = secrets
  }

  return payload
}

/** Coerce a broadcast link (string/number/'') to a non-negative integer (0 = none). */
export function toBroadcastId(v) {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}
