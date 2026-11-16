import { describe, expect, it } from 'vitest';
import { mapSignUpError } from '../../src/backend/utils/signUpErrors.ts';

describe('15 — sign-up failures give a specific, useful message', () => {
  const cases: Array<[string, { code?: string; message?: string }, number, string]> = [
    ['email rate limit by code', { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, 429, 'EMAIL_RATE_LIMIT'],
    ['email rate limit by text', { message: 'Email rate limit exceeded' }, 429, 'EMAIL_RATE_LIMIT'],
    ['already registered', { code: 'user_already_exists', message: 'User already registered' }, 409, 'EMAIL_ALREADY_REGISTERED'],
    ['sign-ups switched off', { code: 'signup_disabled', message: 'Signups not allowed for this instance' }, 403, 'SIGNUP_DISABLED'],
    ['weak password', { code: 'weak_password', message: 'Password should be at least 6 characters.' }, 422, 'WEAK_PASSWORD'],
    ['database trigger failure', { code: 'unexpected_failure', message: 'Database error saving new user' }, 500, 'DATABASE_SETUP_ERROR'],
    ['database rule rejects a non-UCC email', { message: 'UCC_EMAIL_REQUIRED: only ucc.edu.gh' }, 422, 'UCC_EMAIL_REQUIRED'],
    ['anything else', { message: 'something odd' }, 502, 'REGISTRATION_FAILED'],
  ];
  for (const [name, err, status, code] of cases) {
    it(name, () => {
      const out = mapSignUpError(err);
      expect(out.statusCode ?? (out as unknown as { status: number }).status).toBe(status);
      expect(out.code).toBe(code);
    });
  }
});
