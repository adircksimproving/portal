import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import SqliteStoreFactory from 'better-sqlite3-session-store';
import cookieParser from 'cookie-parser';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';

import { db, bootstrapAdmin } from './db/index.js';
import { findUserById } from './db/users.js';
import { loadUser, requireAuth, requireSameOrigin } from './middleware/auth.js';
import { authRouter, profileRouter } from './routes/auth.js';
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

bootstrapAdmin();

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

  app.use(requireSameOrigin);
  app.use(loadUser);

  app.get('/api/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    res.json({
      id: req.user.id,
      username: req.user.username,
      is_admin: !!req.user.is_admin,
      impersonating: !!req.impersonator,
      impersonator: req.impersonator ? { id: req.impersonator.id, username: req.impersonator.username } : null,
    });
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
      is_admin: !!user.is_admin,
      impersonating: false,
      impersonator: null,
    });
  });

  app.get('/', (req, res, next) => {
    if (req.user) return res.redirect('/portal');
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
