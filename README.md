# Portal

Authentication and routing hub for Improving's internal app ecosystem. Owns user accounts, login, sessions, and the app dashboard. Sibling apps (revenue-analysis-app, consultant-directory-app) resolve identity by calling portal's `/api/me` with the shared `portal_sid` session cookie.

---

## Running the App

```bash
npm install
cp .env.example .env   # set SESSION_SECRET and BOOTSTRAP_ADMIN_PASSWORD at minimum
npm start
```

Navigate to `http://localhost:3001`. On first start, the server bootstraps a SQLite database at `./data/portal.db`, creates the sessions database at `./data/sessions.db`, and seeds the admin account from the `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` environment variables.

**Test suite:**
```bash
npm test
```

Tests use `node --test --test-force-exit tests/` because the SQLite session store holds a cleanup interval open.

---

## Pages

| Page | File | Purpose |
|---|---|---|
| Login | `index.html` | Entry point. Username/password form with rate-limited submit. |
| Register | `register.html` | Self-serve account creation — anyone with the URL can sign up. |
| Dashboard | `portal.html` | App launcher. Links to sibling apps (revenue-analysis-app, consultant-directory-app). |
| Profile | `profile.html` | Edit own first/last name, username, and password. |
| Admin | `admin.html` | User management: create, reset passwords, promote/demote, delete, impersonate. |

---

## User Flows

### Login
1. Submit username and password on `index.html`
2. Rate limiter enforces 5 attempts per minute
3. On success: session is created, user is redirected to `/portal`
4. On failure: redirected back with an `?error=` query param

### Register
1. Navigate to `/register`
2. Enter first name, last name, username, and password
3. Username must be a valid email address; password must meet minimum requirements
4. On success: user is logged in and redirected to `/portal`

### Cross-App Handoff
When a sibling app needs to verify identity and the `portal_sid` cookie is not yet present (e.g. local dev with different ports):

1. Sibling redirects user to `GET /auth/handoff?return=<sibling-url>`
2. If the user is logged in, portal mints a one-time 60-second token and redirects to `<sibling-url>?portal_token=<token>`
3. Sibling calls `POST /api/exchange` with `{ token }` server-to-server to receive the user record
4. In production, `COOKIE_DOMAIN=.up.railway.app` causes the browser to send `portal_sid` directly to all sibling apps — no handoff needed

### Admin: Impersonation
1. Admin navigates to `/admin`
2. Click **Impersonate** on any non-admin user
3. Portal swaps `req.session.userId` to the target; `req.session.impersonatorId` preserves the admin's identity
4. The impersonation banner (rendered by `assets/portal-session.js`) appears on all pages
5. Click **Stop impersonating** to restore the admin session

---

## Auth Model

Custom username + password. No Entra ID, no OAuth, no email/SMTP.

- Passwords are hashed with bcrypt before storage
- Sessions are persisted in a separate SQLite file (`sessions.db`) via `better-sqlite3-session-store`
- Sessions roll (expiry resets on each request) and expire after 30 days of inactivity
- The bootstrap admin is seeded once on first run; subsequent starts skip seeding if an admin already exists
- Self-serve password reset is not supported — admins issue temporary passwords via the admin UI
- Cannot impersonate other admins, cannot impersonate self, cannot delete or demote self, cannot demote the last admin

---

## Data Model

```
users
  id, username (UNIQUE), password_hash
  first_name, last_name
  is_admin (0|1)
  last_login_at
```

---

## API Routes

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/auth/register` | `{ first_name, last_name, username, password }` | Create account and log in |
| POST | `/auth/login` | `{ username, password, next? }` | Authenticate and create session |
| POST | `/auth/logout` | — | Destroy session and clear cookie |
| GET | `/auth/logout` | — | Same as POST — supports link-based logout |
| GET | `/auth/handoff` | `?return=<url>` | Mint one-time token and redirect to sibling app |

### Profile

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/profile/name` | `{ first_name, last_name }` | Update own name |
| POST | `/profile/username` | `{ username }` | Update own username |
| POST | `/profile/password` | `{ current_password, new_password }` | Change own password |

### Admin (requires admin role)

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/admin/users.json` | — | List all users |
| POST | `/admin/users` | `{ username, password, is_admin? }` | Create user |
| POST | `/admin/users/:id/reset-password` | — | Generate and store a temporary password |
| POST | `/admin/users/:id/promote` | — | Grant admin role |
| POST | `/admin/users/:id/demote` | — | Remove admin role |
| POST | `/admin/users/:id/delete` | — | Delete user |
| POST | `/admin/impersonate/:id` | — | Begin impersonating a user |
| POST | `/admin/impersonate/stop` | — | Stop impersonating, restore admin session |

### Server-to-Server

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/me` | `portal_sid` cookie | Return current user record (401 if unauthenticated) |
| POST | `/api/exchange` | — | Exchange one-time handoff token for user record |
| PUT | `/api/users/name` | `Authorization: Bearer <PORTAL_API_SECRET>` | Sync name update from a sibling app back to portal |

**`/api/me` response shape:**
```json
{
  "id": 1,
  "username": "austin.dircks@improving.com",
  "firstName": "Austin",
  "lastName": "Dircks",
  "is_admin": true,
  "impersonating": false,
  "impersonator": null
}
```

---

## App Ecosystem

| App | Production URL | Role |
|---|---|---|
| Portal | https://portal-production-2c38.up.railway.app/ | Auth hub — this app |
| Revenue Analysis | https://revenue-analysis-app-production.up.railway.app/ | Project financial tracking |
| Consultant Directory | https://consultant-directory-app-production.up.railway.app/ | Consultant search and profiles |

Sibling apps call `GET /api/me` with the `portal_sid` cookie to resolve the current user. In production, `COOKIE_DOMAIN=.up.railway.app` shares the cookie across all `*.up.railway.app` subdomains automatically.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript, HTML5, CSS3 |
| Backend | Express 5.2.1 (Node.js) |
| Database | SQLite via better-sqlite3 |
| Sessions | express-session + better-sqlite3-session-store |
| Auth | bcrypt password hashing |
| Rate limiting | express-rate-limit (5 req/min on login and register) |
| Tests | node:test + supertest |

---

## Project Structure

```
portal/
├── index.html              Login page
├── register.html           Registration page
├── portal.html             App dashboard
├── profile.html            Edit own profile
├── admin.html              User management
├── server.js               Express app setup, session config, route mounting
├── db/
│   ├── schema.sql          users table definition
│   ├── index.js            SQLite connection and bootstrap admin seed
│   └── users.js            User CRUD and password hashing
├── routes/
│   ├── auth.js             /auth/* and /profile/* routes
│   └── admin.js            /admin/* routes
├── middleware/
│   └── auth.js             loadUser, requireAuth, requireAdmin, requireSameOrigin
├── lib/
│   ├── handoff.js          One-time token mint/consume for cross-app handoff
│   └── validate.js         Username and password validation rules
├── assets/
│   └── portal-session.js   Shared client helper: impersonation banner
├── styles/                 CSS (layout, auth, account, admin)
├── tests/
│   └── auth.test.js        Integration tests
├── data/
│   ├── portal.db           SQLite database (auto-created on first run, gitignored)
│   └── sessions.db         Session store (auto-created on first run, gitignored)
└── package.json
```

---

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3001` |
| `NODE_ENV` | `production` enables secure cookies; `test` disables rate limits | unset |
| `SESSION_SECRET` | Cookie signing secret — must be set in production | `dev-secret-do-not-use-in-prod` |
| `DB_PATH` | Path to portal SQLite database | `./data/portal.db` |
| `SESSIONS_DB_PATH` | Path to sessions SQLite database | `./data/sessions.db` |
| `COOKIE_DOMAIN` | Set to `.up.railway.app` in production for cross-app cookie sharing | unset |
| `BOOTSTRAP_ADMIN_USERNAME` | Admin account seeded on first run | unset |
| `BOOTSTRAP_ADMIN_PASSWORD` | Admin password seeded on first run | unset |
| `PORTAL_API_SECRET` | Bearer token for server-to-server `PUT /api/users/name` | unset |

---

## Deployment

Hosted on Railway. Railway infers Node.js from `package.json` and runs `npm start` → `node server.js`.

Required Railway configuration:
- Persistent volume mounted at `/data` (SQLite files survive redeploys)
- `DB_PATH=/data/portal.db`, `SESSIONS_DB_PATH=/data/sessions.db`
- `NODE_ENV=production`, `SESSION_SECRET=<random>`, `COOKIE_DOMAIN=.up.railway.app`
- `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` for first deploy only

To verify production is healthy: https://portal-production-2c38.up.railway.app/

---

## Known Issues / Gotchas

- **Open registration.** Anyone with the `/register` URL can create an account. There is no invite-only gate or domain restriction.
- **No email channel.** Password reset is admin-mediated. Users who forget their password must contact an admin for a temporary password.
- **Impersonation writes data as the target user.** Actions taken during impersonation are stamped with the impersonated user's ID in sibling apps — this is intentional behavior.
- **`data/` directory is ephemeral on Railway without a volume.** Mount a persistent volume at `/data` or user data will be lost on redeploy.
- **Rate limiter is disabled in test mode.** Setting `NODE_ENV=test` bypasses login and register rate limits entirely.

---

## Git Workflow

- Branch naming: `feature/short-description` or `fix/short-description`
- Commit messages: present-tense, imperative ("Add impersonation banner", not "Added...")
