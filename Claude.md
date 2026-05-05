# Portal

Authentication and routing hub for the internal app ecosystem. Serves the login page and a dashboard that links users to the Revenue Analysis App and the Consultant Directory. Auth implementation is currently frontend-only (no real validation) — Entra ID integration is the planned path forward.

**Production:** https://portal-production-2c38.up.railway.app/
**GitHub:** https://github.com/adircksimproving/portal

---

## App Ecosystem

These three apps share a common auth layer (portal) and serve the same users (delivery managers, project managers). Before changing anything related to auth, routing, user identity, or navigation — check what portal does first.

| Repo | Local Path | Production URL | Role |
|---|---|---|---|
| `portal` | `~/Documents/projects/internal/portal-main` | https://portal-production-2c38.up.railway.app/ | Auth hub — login page and app dashboard |
| `revenue-analysis-app` | `~/Documents/projects/internal/revenue-analysis-app-main` | https://revenue-analysis-app-production.up.railway.app/ | Project financial tracking and forecasting |
| `consultant-directory-app` | `~/Documents/projects/internal/consultant-directory-app-main` | https://consultant-directory-app-production.up.railway.app/ | Consultant search and profile directory |

### Load sibling repos in a session

```bash
# Start with multiple repos
claude --add-dir ~/Documents/projects/internal/portal-main \
       --add-dir ~/Documents/projects/internal/revenue-analysis-app-main

# Add mid-session
/add-dir ~/Documents/projects/internal/revenue-analysis-app-main
```

### Cross-repo rules

- Auth is owned by portal. Any login, session, or identity work in sibling apps must mirror the pattern portal establishes — do not invent a separate auth approach per-app.
- The navigation pattern (portal logo links to portal, sign-out links to portal root) is implemented in both sibling apps. If portal's URL changes or auth changes, update the `BASE_URL` logic in `home.html` in both sibling repos.
- Consultant name is the shared identity key across `revenue-analysis-app` (consultants table) and `consultant-directory-app` (consultants table). If the name format or identity field changes in one, flag the impact in the other.
- Do NOT modify files in sibling repos unless explicitly asked. If a change here requires follow-up elsewhere, say so: "Follow-up needed in [repo]: [what and where]."

---

## This Repo: Structure & Key Files

```
portal/
├── index.html          # Login page — email + password form (frontend validation only)
├── portal.html         # Dashboard — app tile grid linking to sibling apps
├── server.js           # Express static file server, PORT env var (default 3001)
├── package.json        # express 5.2.1 only
├── assets/
│   ├── improving-logo-full.png
│   └── improving-logo-simple.png
└── styles/
    ├── layout.css      # Typography, messaging, card/tile layout
    └── account.css     # User button, avatar, sign-out button
```

**Read before making changes:**
- `index.html` — owns the login form, validation logic, and post-auth redirect behavior
- `portal.html` — owns the app tile grid and hardcoded links to sibling app production URLs
- `server.js` — minimal Express static server; the only backend file

---

## Running Locally

```bash
npm install
node server.js
# Serves on http://localhost:3001
```

No build step. Open `index.html` directly or via the Express server.

---

## Architecture Notes

**Auth is currently fake.** `index.html` validates that email and password fields are non-empty, then redirects to `portal.html`. There is no backend credential check, no session, and no token. This is a placeholder — do not deepen reliance on this pattern. When Entra ID auth lands, it will replace the current form entirely.

**Sibling app links are hardcoded** in `portal.html` as Railway production URLs. When working locally, these links will point at production. There is no environment-aware routing on the portal side — navigation to sibling apps is a static `<a href>`, not a redirect through any portal endpoint.

**No environment variables except PORT.** server.js reads `process.env.PORT` (default 3001). Nothing else is configurable via environment.

**Design system:** Poppins (headings) and Khula (body) via Google Fonts. Primary blue: `#005596`. Neutral grays: `#f8f9fa`, `#e5e7eb`. This palette is shared across all three apps — do not introduce new brand colors without applying them consistently.

---

## Code Style

- Vanilla HTML, CSS, and JavaScript only. No frameworks, no bundler, no build step.
- Do not add npm packages beyond Express without being explicitly asked.
- `const` and `let` only — never `var`.
- Named functions — no anonymous functions for anything non-trivial.
- No inline styles — CSS classes only.
- CSS classes use kebab-case. JS variables use camelCase.

---

## Constraints

- Do not add React, Vue, or any frontend framework. This is intentionally vanilla.
- Do not add authentication middleware, session libraries, or JWT packages speculatively. When auth is implemented, it will use Entra ID via Microsoft identity platform — wait for that work to be scoped before touching auth infrastructure.
- NEVER add logic that validates credentials in `server.js` — that belongs in a dedicated auth route when the time comes.

---

## Git Workflow

- Branch naming: `feature/short-description` or `fix/short-description`
- Commit messages: present-tense, imperative ("Add consultant directory tile", not "Added...")

---

## Deployment

Hosted on Railway. No Dockerfile or railway.json needed — Railway infers Node.js from `package.json` and runs `npm start` → `node server.js`. The `PORT` environment variable is set by Railway automatically.

To verify production is healthy: https://portal-production-2c38.up.railway.app/
