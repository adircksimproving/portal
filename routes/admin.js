import { Router } from 'express';
import crypto from 'crypto';
import {
  listUsers,
  createUser,
  findUserById,
  findUserByUsername,
  updatePassword,
  setAdmin,
  deleteUser,
  countAdmins,
} from '../db/users.js';
import { validateUsername, validatePassword } from '../lib/validate.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users.json', (req, res) => {
  res.json({ users: listUsers() });
});

adminRouter.post('/users', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const usernameErr = validateUsername(username);
  if (usernameErr) return res.redirect('/admin?error=' + encodeURIComponent(usernameErr));
  const passwordErr = validatePassword(password);
  if (passwordErr) return res.redirect('/admin?error=' + encodeURIComponent(passwordErr));
  if (findUserByUsername(username)) {
    return res.redirect('/admin?error=' + encodeURIComponent('That username is already taken.'));
  }
  createUser({ username, password, isAdmin: req.body.is_admin === 'on' });
  res.redirect('/admin?ok=' + encodeURIComponent('User created.'));
});

adminRouter.post('/users/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  const target = findUserById(id);
  if (!target) return res.redirect('/admin?error=' + encodeURIComponent('User not found.'));
  const tempPassword = crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '') + '1A';
  updatePassword(id, tempPassword);
  res.redirect('/admin?reset_for=' + encodeURIComponent(target.username) + '&temp=' + encodeURIComponent(tempPassword));
});

adminRouter.post('/users/:id/promote', (req, res) => {
  const id = Number(req.params.id);
  setAdmin(id, true);
  res.redirect('/admin?ok=' + encodeURIComponent('User promoted to admin.'));
});

adminRouter.post('/users/:id/demote', (req, res) => {
  const id = Number(req.params.id);
  const actor = req.impersonator || req.user;
  if (id === actor.id) {
    return res.redirect('/admin?error=' + encodeURIComponent('Cannot demote yourself.'));
  }
  if (countAdmins() <= 1) {
    return res.redirect('/admin?error=' + encodeURIComponent('Cannot demote the last admin.'));
  }
  setAdmin(id, false);
  res.redirect('/admin?ok=' + encodeURIComponent('Admin demoted.'));
});

adminRouter.post('/users/:id/delete', (req, res) => {
  const id = Number(req.params.id);
  const actor = req.impersonator || req.user;
  if (id === actor.id) {
    return res.redirect('/admin?error=' + encodeURIComponent('Cannot delete yourself.'));
  }
  const target = findUserById(id);
  if (target?.is_admin && countAdmins() <= 1) {
    return res.redirect('/admin?error=' + encodeURIComponent('Cannot delete the last admin.'));
  }
  deleteUser(id);
  res.redirect('/admin?ok=' + encodeURIComponent('User deleted.'));
});

adminRouter.post('/impersonate/stop', (req, res) => {
  if (!req.session.impersonatorId) return res.redirect('/portal');
  req.session.userId = req.session.impersonatorId;
  req.session.impersonatorId = null;
  res.redirect('/admin');
});

adminRouter.post('/impersonate/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = findUserById(id);
  const actor = req.impersonator || req.user;
  if (!target) return res.redirect('/admin?error=' + encodeURIComponent('User not found.'));
  if (target.id === actor.id) {
    return res.redirect('/admin?error=' + encodeURIComponent('Cannot impersonate yourself.'));
  }
  if (target.is_admin) {
    return res.redirect('/admin?error=' + encodeURIComponent('Cannot impersonate another admin.'));
  }
  if (req.session.impersonatorId) {
    return res.redirect('/admin?error=' + encodeURIComponent('Already impersonating. Stop first.'));
  }
  req.session.impersonatorId = req.user.id;
  req.session.userId = target.id;
  res.redirect('/portal');
});
