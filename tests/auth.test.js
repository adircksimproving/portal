import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'portal-test-'));
process.env.DB_PATH = join(tmp, 'portal.db');
process.env.SESSIONS_DB_PATH = join(tmp, 'sessions.db');
process.env.SESSION_SECRET = 'test-secret';
process.env.BOOTSTRAP_ADMIN_USERNAME = 'admin@test';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'adminpass1234';
process.env.NODE_ENV = 'test';

const { createApp } = await import('../server.js');
const request = (await import('supertest')).default;
const app = createApp();

after(() => rmSync(tmp, { recursive: true, force: true }));

function getCookie(res) {
  const sc = res.headers['set-cookie'] || [];
  return sc.map(c => c.split(';')[0]).join('; ');
}

test('GET / returns login page', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
});

test('GET /portal unauthenticated redirects to /', async () => {
  const res = await request(app).get('/portal');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/');
});

test('GET /api/me unauthenticated returns 401', async () => {
  const res = await request(app).get('/api/me');
  assert.equal(res.status, 401);
});

test('register with weak password is rejected', async () => {
  const res = await request(app).post('/auth/register').type('form').send({ username: 'weak', password: 'short' });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/register\?error=/);
});

test('register, login, logout flow', async () => {
  const reg = await request(app).post('/auth/register').type('form').send({ username: 'user1', password: 'password1234' });
  assert.equal(reg.status, 302);
  assert.equal(reg.headers.location, '/portal');
  const cookie = getCookie(reg);

  const me = await request(app).get('/api/me').set('Cookie', cookie);
  assert.equal(me.status, 200);
  assert.equal(me.body.username, 'user1');
  assert.equal(me.body.is_admin, false);

  const out = await request(app).post('/auth/logout').set('Cookie', cookie);
  assert.equal(out.status, 302);
});

test('duplicate username rejected', async () => {
  await request(app).post('/auth/register').type('form').send({ username: 'dupe', password: 'password1234' });
  const res = await request(app).post('/auth/register').type('form').send({ username: 'dupe', password: 'password1234' });
  assert.match(res.headers.location, /already%20taken/);
});

test('invalid login is generic error', async () => {
  const res = await request(app).post('/auth/login').type('form').send({ username: 'admin@test', password: 'wrong' });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/\?error=Invalid/);
});

test('non-admin cannot reach admin routes', async () => {
  const reg = await request(app).post('/auth/register').type('form').send({ username: 'normie', password: 'password1234' });
  const cookie = getCookie(reg);
  const res = await request(app).get('/admin/users.json').set('Cookie', cookie);
  assert.equal(res.status, 403);
});

test('admin impersonation flow', async () => {
  const login = await request(app).post('/auth/login').type('form').send({ username: 'admin@test', password: 'adminpass1234' });
  const adminCookie = getCookie(login);

  await request(app).post('/admin/users').set('Cookie', adminCookie).type('form').send({ username: 'target', password: 'password1234' });
  const list = await request(app).get('/admin/users.json').set('Cookie', adminCookie);
  const target = list.body.users.find(u => u.username === 'target');

  const imp = await request(app).post(`/admin/impersonate/${target.id}`).set('Cookie', adminCookie);
  assert.equal(imp.status, 302);
  assert.equal(imp.headers.location, '/portal');

  const me = await request(app).get('/api/me').set('Cookie', adminCookie);
  assert.equal(me.body.username, 'target');
  assert.equal(me.body.impersonating, true);
  assert.equal(me.body.impersonator.username, 'admin@test');

  const stop = await request(app).post('/admin/impersonate/stop').set('Cookie', adminCookie);
  assert.equal(stop.headers.location, '/admin');
  const me2 = await request(app).get('/api/me').set('Cookie', adminCookie);
  assert.equal(me2.body.username, 'admin@test');
  assert.equal(me2.body.impersonating, false);
});

test('cannot delete or demote self', async () => {
  const login = await request(app).post('/auth/login').type('form').send({ username: 'admin@test', password: 'adminpass1234' });
  const cookie = getCookie(login);
  const list = await request(app).get('/admin/users.json').set('Cookie', cookie);
  const me = list.body.users.find(u => u.username === 'admin@test');

  const del = await request(app).post(`/admin/users/${me.id}/delete`).set('Cookie', cookie);
  assert.match(del.headers.location, /Cannot%20delete%20yourself/);
  const dem = await request(app).post(`/admin/users/${me.id}/demote`).set('Cookie', cookie);
  assert.match(dem.headers.location, /Cannot%20demote%20yourself/);
});

test('profile username and password change', async () => {
  const agent = request.agent(app);
  await agent.post('/auth/register').type('form').send({ username: 'profileuser', password: 'password1234' });

  const u = await agent.post('/profile/username').type('form').send({ username: 'profileuser2' });
  assert.match(u.headers.location, /\/profile\?ok=/);

  const pwBad = await agent.post('/profile/password').type('form').send({ current_password: 'wrong', new_password: 'newpassword12' });
  assert.match(pwBad.headers.location, /Current%20password%20is%20incorrect/);

  const pwOk = await agent.post('/profile/password').type('form').send({ current_password: 'password1234', new_password: 'newpassword12' });
  assert.match(pwOk.headers.location, /\/profile\?ok=/);

  const newLogin = await request(app).post('/auth/login').type('form').send({ username: 'profileuser2', password: 'newpassword12' });
  assert.equal(newLogin.headers.location, '/portal');
});
