---
status: accepted
---

# Grammar-agnostic per-Connection qb factory

cbqManager builds qb instances at runtime through a factory that binds each query to a **Connection's own grammar + datasource**, rather than a single hardcoded SqlServer grammar like the reference app. Because cbq supports every qb grammar, this lets cbqManager manage a cbq queue on **any qb-supported engine** (SQL Server, MySQL, Postgres, SQLite, …), and lets its own store start on SQLite and move to MSSQL with no code change.

A Connection's grammar is **auto-detected once at registration** (via qb AutoDiscover / a probe), **persisted**, and thereafter used deterministically — but the operator can **override** the detected grammar (e.g. to force an auto-retry variant). The factory may wrap the chosen grammar with an auto-retry decorator (generalizing the reference's `AutoRetrySqlServerGrammar`) for busy production queue tables.

## Consequences

- Connections must store their grammar/engine; datasources come from the encrypted registry and so are resolved at request time rather than pre-wired in WireBox.
- cbqManager's own cfmigrations must be authored portably across grammars (notably SQLite's limited `ALTER` and type differences); app-layer credential encryption avoids any dependency on DB-native crypto functions.
