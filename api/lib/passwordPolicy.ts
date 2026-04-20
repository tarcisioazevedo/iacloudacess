/**
 * Password Policy Validator
 *
 * Rules:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 *
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validatePassword(password: string): string[] {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push('Senha deve ter no mínimo 8 caracteres');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Senha deve conter ao menos 1 letra maiúscula');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Senha deve conter ao menos 1 letra minúscula');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Senha deve conter ao menos 1 número');
  }

  return errors;
}

export function isPasswordValid(password: string): boolean {
  return validatePassword(password).length === 0;
}
