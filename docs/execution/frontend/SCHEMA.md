# Frontend Track: Schema Delta

**Status**: No new tables required for v1.

The API layer authenticates via a single shared token (`API_AUTH_TOKEN`, env var), not a database-backed token/session table — consistent with this being a single-operator tool (same reasoning the rest of the project has applied throughout, per Design Principle 10: don't over-engineer the first version). Revoking access means rotating the env var and restarting the API process; no user table, no session table, no login flow.

If this ever needs to support more than one person deciding gates (unlikely soon, per `AGENT_FLEET_DESIGN.md` Section 1's "self-use only for 6–10 months"), a real `User`/session model would be the point to revisit this — not now.

## Reference
- `docs/execution/frontend/BUSINESS_LOGIC.md`
- `AGENT_FLEET_DESIGN.md` Section 6 (existing `Tenant`/`User` shape, dormant, would be the natural extension point later)
