import { AppError } from './errors.ts';

interface AuthLikeError {
  message?: string;
  code?: string;
  status?: number;
}

/**
 * Turns a Supabase Auth sign-up failure into a clear message for the student, instead of one
 * vague "unable to create the account" for every cause. The real error is logged on the server.
 */
export function mapSignUpError(error: AuthLikeError | null | undefined): AppError {
  const code = (error?.code ?? '').toLowerCase();
  const msg = (error?.message ?? '').toLowerCase();

  if (msg.includes('ucc_email_required')) {
    return new AppError(422, 'UCC_EMAIL_REQUIRED', 'Use your UCC email address (it must end in ucc.edu.gh).');
  }
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit')) {
    return new AppError(
      429,
      'EMAIL_RATE_LIMIT',
      'Too many confirmation emails have been requested. Please wait a few minutes and try again.'
    );
  }
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered') || msg.includes('already been registered')) {
    return new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'That email is already registered. Sign in instead.');
  }
  if (code === 'signup_disabled' || msg.includes('signups not allowed') || msg.includes('signup is disabled')) {
    return new AppError(403, 'SIGNUP_DISABLED', 'Registration is currently closed. Contact your administrator.');
  }
  if (code === 'weak_password' || msg.includes('password should')) {
    return new AppError(422, 'WEAK_PASSWORD', error?.message || 'Choose a stronger password.');
  }
  if (code === 'email_address_invalid' || msg.includes('email address') && msg.includes('invalid')) {
    return new AppError(422, 'EMAIL_INVALID', 'That email address was not accepted. Check it and try again.');
  }
  if (msg.includes('database error saving new user') || code === 'unexpected_failure') {
    return new AppError(
      500,
      'DATABASE_SETUP_ERROR',
      'Registration failed because of a server setup problem. Please tell your administrator.'
    );
  }
  return new AppError(
    502,
    'REGISTRATION_FAILED',
    'Registration did not complete. Please try again in a moment, and tell your administrator if it keeps happening.'
  );
}
