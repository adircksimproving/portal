import { randomBytes } from 'crypto';

const TOKEN_TTL_MS = 60 * 1000;
const tokens = new Map();

export function mintHandoffToken(userId) {
    const token = randomBytes(32).toString('hex');
    tokens.set(token, { userId, expires: Date.now() + TOKEN_TTL_MS });
    return token;
}

export function consumeHandoffToken(token) {
    if (!token) return null;
    const entry = tokens.get(token);
    if (!entry) return null;
    tokens.delete(token);
    if (entry.expires < Date.now()) return null;
    return entry.userId;
}

// Allowlist of origins that may use the handoff. Add new sibling apps here.
const ALLOWED_RETURN_ORIGINS = new Set([
    'http://localhost:3000',
    'http://localhost:3002',
    'https://revenue-analysis-app-production.up.railway.app',
    'https://consultant-directory-app-production.up.railway.app',
]);

export function isAllowedReturn(returnUrl) {
    try {
        return ALLOWED_RETURN_ORIGINS.has(new URL(returnUrl).origin);
    } catch {
        return false;
    }
}
