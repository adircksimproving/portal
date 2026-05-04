import express from 'express';
import jwt from 'jsonwebtoken';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Hardcoded user for now
const USERS = [
  { email: 'austin.dircks@improving.com', name: 'Austin Dircks' }
];

app.use(express.json());

// Serve static assets (logo images, etc.)
app.use('/assets', express.static(join(__dirname, 'assets')));

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = USERS.find(u => u.email === email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Any non-empty password is accepted for now
  const token = jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
  return res.json({ token, user: { name: user.name, email: user.email } });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { email, name } = payload;
    return res.json({ user: { email, name } });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

// Serve Vite build in production
const distPath = join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback — all non-/api routes serve index.html
app.get(/^(?!\/api).*$/, (_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Portal running at http://localhost:${PORT}`));
