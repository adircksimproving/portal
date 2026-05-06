# Portal

Authentication and routing hub for the internal app ecosystem. Owns user accounts, login, sessions, and the app dashboard. Sibling apps (revenue-analysis-app, consultant-directory-app) trust portal's session cookie via `/api/me`.

**Production:** https://portal-production-2c38.up.railway.app/
**GitHub:** https://github.com/adircksimproving/portal

---

## App Ecosystem

| Repo | Local Path | Production URL | Role |
|---|---|---|---|
| `portal` | `~/portal` | https://portal-production-2c38.up.railway.app/ | Auth + dashboard |
| `revenue-analysis-app` | `~/revenue-analysis-app` | https://revenue-analysis-app-production.up.railway.app/ | Project financial tracking |
| `consultant-directory-app` | `~/consultant-directory-app` | https://consultant-directory-app-production.up.railway.app/ | Consultant directory |

### Cross-repo rules

- Auth is owned by portal. Sibling apps consume the portal session — they never validate credentials themselves.
- Sibling apps read the `portal_sid` cookie from the incoming request and call portal's `/api/me` to resolve identity. The cookie is shared across `*.up.railway.app` via `COOKIE_DOMAIN=.up.railway.app` in production.
- If portal's `/api/me` shape changes, update both sibling apps in lockstep.
- Consultant name is the shared identity key across `revenue-analysis-app` and `consultant-directory-app`. If the name format changes in one, flag the impact in the other.
- Do NOT modify files in sibling repos unless explicitly asked. If a change here requires follow-up elsewhere, say so: "Follow-up needed in [repo]: [what and where]."

---

## Auth model

Custom username + password. No Entra ID. No email confirmation. No SMTP.

- Open registration at `/register` (anyone with the URL can sign up).
- Admin role: a single bootstrap admin (`austin.dircks@improving.com` by default) is seeded on first run from `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` env vars. Admins can create, promote/demote, reset passwords, delete, and impersonate other users.
- Self-serve password reset is not supported (there is no email channel). Users contact an admin who issues a temporary password via the admin UI.
- Impersonation: admins can act as a non-admin user. The session stores `{ userId, impersonatorId }`. While impersonating, `/api/me` returns the *effective* user; sibling apps stamp data with the impersonated user's id (correct behavior — actions during impersonation belong to the target).
- Cannot impersonate other admins, cannot impersonate self, cannot delete or demote self, cannot demote the last admin.

### `/api/me` contract

```json
{
  "id": 1,
  "username": "austin.dircks@improving.com",
  "is_admin": true,
  "impersonating": false,
  "impersonator": null
}
```

Returns 401 when unauthenticated. Sibling apps cache responses for 60s keyed by session id.

---

## This Repo: Structure & Key Files

```
portal/
├── server.js               # Express app bootstrap, session config, page routes
├── db/
│   ├── schema.sql          # users table
│   ├── index.js            # SQLite connection, bootstrap admin
│   └── users.js            # user queries (CRUD, password hashing)
├── routes/
│   ├── auth.js             # /auth/register, /auth/login, /auth/logout, /profile
│   └── admin.js            # /admin/users, /admin/impersonate
├── middleware/auth.js      # loadUser, requireAuth, requireAdmin, requireSameOrigin
├── lib/validate.js         # username/password validation
├── tests/auth.test.js      # node:test + supertest
├── index.html              # Login page
├── register.html           # Registration page
├── portal.html             # Dashboard
├── profile.html            # Edit own username/password
├── admin.html              # User management UI
├── assets/portal-session.js  # Shared client helpers (impersonation banner)
└── styles/                 # layout, account, auth, admin
```

**Read before making changes:**
- `server.js` — session config, route wiring, cookie domain logic
- `routes/auth.js` and `routes/admin.js` — owns the auth surface area
- `db/users.js` — single source of truth for user persistence

---

## Running Locally

```bash
npm install
cp .env.example .env  # edit BOOTSTRAP_ADMIN_PASSWORD at minimum
npm start
# http://localhost:3001
```

The SQLite database is created at `./data/portal.db` on first run. Sessions are persisted at `./data/sessions.db`.

To run tests:
```bash
npm test
```

Tests use `node --test --test-force-exit tests/` because the SQLite session store keeps a cleanup interval alive.

---

## Environment variables

| Var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | 3001 |
| `NODE_ENV` | `production` enables secure cookies; `test` disables rate limits | unset |
| `SESSION_SECRET` | Cookie signing secret — must be set in prod | `dev-secret-do-not-use-in-prod` |
| `DB_PATH` | Path to portal SQLite db | `./data/portal.db` |
| `SESSIONS_DB_PATH` | Path to sessions SQLite db | `./data/sessions.db` |
| `COOKIE_DOMAIN` | Set to `.up.railway.app` in prod for cross-app cookie sharing | unset |
| `BOOTSTRAP_ADMIN_USERNAME` | Seeded admin username (only used if no admin exists) | unset |
| `BOOTSTRAP_ADMIN_PASSWORD` | Seeded admin password | unset |

---

## Code Style

- Vanilla HTML, CSS, and JavaScript only. No frameworks, no bundler, no build step.
- Backend: Express + better-sqlite3 + bcrypt + express-session. Do not add new npm packages without being explicitly asked.
- `const` and `let` only — never `var`.
- CSS classes use kebab-case. JS variables use camelCase.

---

## Constraints

- Do not add React, Vue, or any frontend framework. This is intentionally vanilla.
- Do not introduce email/SMTP — by design, password recovery is admin-mediated.
- Do not add Entra ID, OAuth, or JWT. The auth model is intentionally a custom username/password system.
- Cookie domain must stay `.up.railway.app` in production so sibling apps can read the session. Don't move portal off Railway without coordinating with the sibling apps.

---

## Git Workflow

- Branch naming: `feature/short-description` or `fix/short-description`
- Commit messages: present-tense, imperative ("Add consultant directory tile", not "Added...")

---

## Deployment

Hosted on Railway. Railway infers Node.js from `package.json` and runs `npm start`. Required Railway config:
- Persistent volume mounted at `/data` (so the SQLite file survives redeploys)
- `DB_PATH=/data/portal.db`, `SESSIONS_DB_PATH=/data/sessions.db`
- `NODE_ENV=production`, `SESSION_SECRET=<random>`, `COOKIE_DOMAIN=.up.railway.app`
- `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` for first deploy only

To verify production is healthy: https://portal-production-2c38.up.railway.app/
