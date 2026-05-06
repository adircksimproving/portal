export function validateUsername(username) {
  if (typeof username !== 'string') return 'Username is required.';
  const trimmed = username.trim();
  if (trimmed.length < 3) return 'Username must be at least 3 characters.';
  if (trimmed.length > 100) return 'Username must be at most 100 characters.';
  return null;
}

export function validatePassword(password) {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain letters and numbers.';
  }
  return null;
}
