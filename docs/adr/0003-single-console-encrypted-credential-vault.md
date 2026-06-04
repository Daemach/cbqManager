---
status: accepted
---

# Single console spanning all environments with an encrypted credential vault

A single cbqManager instance holds a registry of **many Connections spanning all environments, including production**, and the UI switches between them. DB and Broadcast credentials are stored in cbqManager's own database, with secret fields (DB passwords, Pusher secrets) **encrypted at the application layer using an AES key supplied via the environment** (`getSystemSetting("CBQM_ENCRYPTION_KEY")`); only secret fields are encrypted (with a per-record IV) so the registry stays queryable on non-secret columns. Encryption sits behind a `CredentialCipher` seam so a cloud KMS implementation can replace the env-key one later.

## Considered Options

- **Single console + encrypted vault (chosen)** — one pane of glass across every environment. Trade-off: the box running cbqManager needs network + credentials to every target DB, and cbqManager becomes a high-value credential store.
- **Deploy per environment, datasource via env config** (originally recommended) — no cross-environment credentials ever live on one host; rejected because it forfeits the single-console experience the team wants.

## Consequences

- A compromise of the console exposes every environment's DB credentials; access is gated by RBAC with per-Connection scoping and all credential changes are audit-logged.
- The encryption key must be present in the environment for the console to decrypt and connect; losing it orphans the stored credentials.
