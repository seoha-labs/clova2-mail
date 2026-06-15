/**
 * Single source of truth for email-address validation across the extension
 * (background SEND_EMAIL handler, popup recipient UI, CSV import parser).
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}
