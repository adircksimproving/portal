import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  findUserByUsername,
  createUser,
  verifyPassword,
  updateLastLogin,
  updateUsername,
  updatePassword,
  findUserById,
} from '../db/users.js';
import { validateUsername, validatePassword } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const noopLimiter = (req, res, next) => next();
const isTest = process.env.NODE_ENV === 'test';
const loginLimiter = isTest ? noopLimiter : rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
const registerLimiter = isTest ? noopLimiter : rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });

authRouter.post('/register', registerLimiter, (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  const usernameErr = validateUsername(username);
  if (usernameErr) return res.redirect('/register?error=' + encodeURIComponent(usernameErr));
  const passwordErr = validatePassword(password);
  if (passwordErr) return res.redirect('/register?error=' + encodeURIComponent(passwordErr));

  if (findUserByUsername(username)) {
    return res.redirect('/register?error=' + encodeURIComponent('That username is already taken.'));
  }

  const user = createUser({ username, password, isAdmin: false });
  req.session.userId = user.id;
  updateLastLogin(user.id);
  res.redirect('/portal');
});

authRouter.post('/login', loginLimiter, (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  const user = findUserByUsername(username);
  const ok = user && verifyPassword(user, password);
  if (!ok) {
    return res.redirect('/?error=' + encodeURIComponent('Invalid username or password.'));
  }
  req.session.userId = user.id;
  updateLastLogin(user.id);
  res.redirect('/portal');
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('portal_sid', { path: '/' });
    res.redirect('/');
  });
});

export const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.post('/username', (req, res) => {
  const username = (req.body.username || '').trim();
  const err = validateUsername(username);
  if (err) return res.redirect('/profile?error=' + encodeURIComponent(err));

  const existing = findUserByUsername(username);
  if (existing && existing.id !== req.user.id) {
    return res.redirect('/profile?error=' + encodeURIComponent('That username is already taken.'));
  }
  updateUsername(req.user.id, username);
  res.redirect('/profile?ok=' + encodeURIComponent('Username updated.'));
});

profileRouter.post('/password', (req, res) => {
  const current = req.body.current_password || '';
  const next = req.body.new_password || '';
  const fresh = findUserById(req.user.id);
  if (!verifyPassword(fresh, current)) {
    return res.redirect('/profile?error=' + encodeURIComponent('Current password is incorrect.'));
  }
  const passwordErr = validatePassword(next);
  if (passwordErr) return res.redirect('/profile?error=' + encodeURIComponent(passwordErr));

  updatePassword(req.user.id, next);
  res.redirect('/profile?ok=' + encodeURIComponent('Password updated.'));
});
