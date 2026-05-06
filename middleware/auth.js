import { findUserById } from '../db/users.js';

export function loadUser(req, res, next) {
  req.user = null;
  req.impersonator = null;
  if (req.session?.userId) {
    const user = findUserById(req.session.userId);
    if (user) req.user = user;
  }
  if (req.session?.impersonatorId) {
    const imp = findUserById(req.session.impersonatorId);
    if (imp) req.impersonator = imp;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.accepts('html')) return res.redirect('/');
    return res.status(401).json({ error: 'unauthenticated' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  const actor = req.impersonator || req.user;
  if (!actor || !actor.is_admin) {
    return res.status(403).send('Forbidden');
  }
  next();
}

export function requireSameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return next();
  const host = req.get('host');
  try {
    const url = new URL(origin);
    if (url.host !== host) return res.status(403).send('Bad origin');
  } catch {
    return res.status(403).send('Bad origin');
  }
  next();
}
