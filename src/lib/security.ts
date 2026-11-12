export const PASSWORD_MIN_LENGTH = 12;

export function passwordValidationError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include uppercase, lowercase, and a number';
  }
  if (/^(.)\1+$/.test(password) || /password|qwerty|letmein|football/i.test(password)) {
    return 'Choose a less predictable password';
  }
  return null;
}

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
