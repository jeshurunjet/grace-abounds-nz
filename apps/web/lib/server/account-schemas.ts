import { z } from 'zod';
import { PASSWORD_MAX, PASSWORD_MIN } from './password';

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email('Enter a valid email address.');
export const codeField = z
  .string()
  .regex(/^\d{6}$/, 'Enter the six-digit code.');
export const passwordField = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);
