// Single source of truth for new-password rules, shared by the client form
// (live feedback as you type) and the server actions (the authority). Keeping
// both on these helpers stops the two from drifting — a message the UI shows
// is the same one the server would produce.

export const MIN_PASSWORD_LENGTH = 8;

export const MSG_TOO_SHORT = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
export const MSG_NO_MATCH = "Passwords do not match.";
export const MSG_REQUIRED = "New password is required.";
export const MSG_SAME_AS_CURRENT = "New password must be different from the current password.";

export type PasswordFieldErrors = {
  newPassword?: string;
  confirmPassword?: string;
};

/**
 * Lenient, for live UI feedback: an untouched (empty) field produces no error,
 * so the form doesn't shout at someone who hasn't finished typing.
 */
export function passwordFieldErrors(next: string, confirm: string): PasswordFieldErrors {
  const errors: PasswordFieldErrors = {};
  if (next.length > 0 && next.length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = MSG_TOO_SHORT;
  }
  if (confirm.length > 0 && confirm !== next) {
    errors.confirmPassword = MSG_NO_MATCH;
  }
  return errors;
}

/**
 * Strict, for the server: empty counts as invalid. Returns the first problem or
 * null when the pair is acceptable. Never trust the client's own check — the
 * form can be bypassed entirely.
 */
export function validatePasswordPair(next: string, confirm: string): string | null {
  if (!next) return MSG_REQUIRED;
  if (next.length < MIN_PASSWORD_LENGTH) return MSG_TOO_SHORT;
  if (next !== confirm) return MSG_NO_MATCH;
  return null;
}
