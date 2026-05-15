import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import SqliteStoreFactory from 'better-sqlite3-session-store';
import cookieParser from 'cookie-parser';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { randomBytes } from 'node:crypto';

import { db, bootstrapAdmin } from './db/index.js';
import { findUserById, updateName } from './db/users.js';
import { loadUser, requireAuth, requireSameOrigin } from './middleware/auth.js';
import { authRouter, profileRouter, isSafeReturnUrl } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { mintHandoffToken, consumeHandoffToken, isAllowedReturn } from './lib/handoff.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SqliteStore = SqliteStoreFactory(session);

const SESSIONS_DB_PATH = process.env.SESSIONS_DB_PATH || resolve(__dirname, 'data/sessions.db');
mkdirSync(dirname(SESSIONS_DB_PATH), { recursive: true });
const sessionsDb = new Database(SESSIONS_DB_PATH);

const isProd = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-do-not-use-in-prod';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-secret-do-not-use-in-prod')) {
  throw new Error('SESSION_SECRET must be set to a secure value in production');
}

bootstrapAdmin();

const tokenStore = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of tokenStore) {
        if (v.expires < now) tokenStore.delete(k);
    }
}, 60_000);

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.use(session({
    name: 'portal_sid',
    store: new SqliteStore({ client: sessionsDb, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      domain: COOKIE_DOMAIN,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }));

  // Must be before requireSameOrigin — called server-to-server from sibling apps,
  // which send Origin: null (opaque origin) and would otherwise get 403.
  app.post('/api/auth/exchange', (req, res) => {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'missing token' });

    const entry = tokenStore.get(token);
    tokenStore.delete(token);

    if (!entry || entry.expires < Date.now()) {
      return res.status(401).json({ error: 'invalid or expired token' });
    }

    res.json(entry.user);
  });

  app.use(requireSameOrigin);
  app.use(loadUser);

  app.get('/api/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    res.json({
      id: req.user.id,
      username: req.user.username,
      firstName: req.user.first_name || '',
      lastName: req.user.last_name || '',
      is_admin: !!req.user.is_admin,
      impersonating: !!req.impersonator,
      impersonator: req.impersonator ? { id: req.impersonator.id, username: req.impersonator.username } : null,
    });
  });

  // Generates a short-lived token and redirects to the app's callback URL with it
  app.get('/auth/token', requireAuth, (req, res) => {
    const returnUrl = req.query.return_url;
    if (!isSafeReturnUrl(returnUrl)) return res.redirect('/portal');

    const token = randomBytes(32).toString('hex');
    tokenStore.set(token, {
      user: { id: req.user.id, username: req.user.username, is_admin: !!req.user.is_admin },
      expires: Date.now() + 30_000,
    });

    res.redirect(`${returnUrl}?auth_token=${encodeURIComponent(token)}`);
  });

  app.use('/auth', authRouter);
  app.use('/profile', profileRouter);
  app.use('/admin', adminRouter);

  // Cross-domain handoff for sibling apps that can't share the portal_sid
  // cookie (e.g. different subdomains in local dev). In production, set
  // COOKIE_DOMAIN=.up.railway.app so the browser sends portal_sid directly.
  //
  // GET /auth/handoff?return=<allowed-sibling-url>
  //   If logged in: mints a one-time 60s token and 302s to return?portal_token=
  //   If not logged in: redirects to / with the return preserved in ?next=
  app.get('/auth/handoff', (req, res) => {
    const returnUrl = req.query.return;
    if (typeof returnUrl !== 'string' || !isAllowedReturn(returnUrl)) {
      return res.status(400).send('Invalid return URL');
    }
    if (!req.user) {
      return res.redirect(`/?next=${encodeURIComponent(returnUrl)}`);
    }
    const token = mintHandoffToken(req.user.id);
    const dest = new URL(returnUrl);
    dest.searchParams.set('portal_token', token);
    res.redirect(dest.toString());
  });

  // POST /api/exchange  { token }
  //   Server-to-server: exchanges the one-time token for the user record.
  //   Single-use, 60s expiry. Returns the same shape as /api/me.
  app.post('/api/exchange', (req, res) => {
    const { token } = req.body || {};
    const userId = consumeHandoffToken(token);
    if (!userId) return res.status(401).json({ error: 'invalid_or_expired_token' });
    const user = findUserById(userId);
    if (!user) return res.status(401).json({ error: 'user_not_found' });
    res.json({
      id: user.id,
      username: user.username,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      is_admin: !!user.is_admin,
      impersonating: false,
      impersonator: null,
    });
  });

  // PUT /api/users/name  { portalUserId, firstName, lastName }
  // Server-to-server: allows sibling apps to sync a name update back to portal.
  // Authenticated by PORTAL_API_SECRET env var.
  app.put('/api/users/name', (req, res) => {
    const secret = process.env.PORTAL_API_SECRET;
    const authHeader = req.headers['authorization'] || '';
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { portalUserId, firstName, lastName } = req.body || {};
    if (!portalUserId || typeof firstName !== 'string' || typeof lastName !== 'string') {
      return res.status(400).json({ error: 'portalUserId, firstName, and lastName are required' });
    }
    const user = findUserById(portalUserId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    updateName(user.id, firstName.trim(), lastName.trim());
    res.json({ ok: true });
  });

  app.get('/', (req, res, next) => {
    const returnUrl = req.query.return_url;
    if (req.user) {
      if (returnUrl && isSafeReturnUrl(returnUrl)) {
        return res.redirect(`/auth/token?return_url=${encodeURIComponent(returnUrl)}`);
      }
      return res.redirect('/portal');
    }
    if (returnUrl) req.session.return_url = returnUrl;
    res.sendFile(resolve(__dirname, 'index.html'));
  });

  app.get('/register', (req, res) => {
    if (req.user) return res.redirect('/portal');
    res.sendFile(resolve(__dirname, 'register.html'));
  });

  app.get('/portal', requireAuth, (req, res) => {
    res.sendFile(resolve(__dirname, 'portal.html'));
  });

  app.get('/profile', requireAuth, (req, res) => {
    res.sendFile(resolve(__dirname, 'profile.html'));
  });

  app.get('/admin', requireAuth, (req, res) => {
    const actor = req.impersonator || req.user;
    if (!actor.is_admin) return res.status(403).send('Forbidden');
    res.sendFile(resolve(__dirname, 'admin.html'));
  });

  app.use('/assets', express.static(resolve(__dirname, 'assets')));
  app.use('/styles', express.static(resolve(__dirname, 'styles')));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.PORT || 3001;
  createApp().listen(PORT, () => console.log(`Portal running at http://localhost:${PORT}`));
}
