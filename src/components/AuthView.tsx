import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Eye, EyeOff } from 'lucide-react';
import { BrandMark } from './BrandMark.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { ApiClientError } from '../lib/api.ts';

const MIN_PASSWORD_CHARS = 8;
const PEEK_DURATION_MS = 900;

function findInsertedCharIndex(
  prev: string,
  next: string,
  selectionStart: number | null
): number | null {
  if (next.length !== prev.length + 1) {
    return null;
  }
  if (selectionStart !== null && selectionStart >= 1 && selectionStart <= next.length) {
    return selectionStart - 1;
  }
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i] !== next[i]) {
      return i;
    }
  }
  return next.length - 1;
}

interface PeekPasswordInputProps {
  id: string;
  value: string;
  onChange: (nextValue: string) => void;
  autoComplete?: string;
  placeholder?: string;
}

function PeekPasswordInput({
  id,
  value,
  onChange,
  autoComplete = 'off',
  placeholder = 'Enter your password',
}: PeekPasswordInputProps) {
  const [showFullPassword, setShowFullPassword] = useState(false);
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function syncOverlayScroll() {
    if (inputRef.current && overlayRef.current) {
      overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = e.target.value;
    const caret = e.target.selectionStart;

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const insertedIdx = findInsertedCharIndex(value, nextValue, caret);
    if (!showFullPassword && insertedIdx !== null) {
      setRevealedIndex(insertedIdx);
      timerRef.current = window.setTimeout(() => {
        setRevealedIndex(null);
        timerRef.current = null;
      }, PEEK_DURATION_MS);
    } else {
      setRevealedIndex(null);
    }

    onChange(nextValue);
    window.requestAnimationFrame(syncOverlayScroll);
  }

  function handleToggleFullVisibility() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRevealedIndex(null);
    setShowFullPassword((prev) => !prev);
  }

  return (
    <div className="relative">
      {!showFullPassword && value.length > 0 && (
        <div
          ref={overlayRef}
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 h-12 pl-4 pr-12 flex items-center overflow-hidden whitespace-pre font-mono text-base tracking-normal text-[#1D1D1F] dark:text-[#FDFDFD]"
        >
          {Array.from(value).map((char, idx) =>
            idx === revealedIndex ? (
              <span
                key={idx}
                className="text-[#0A4DA8] dark:text-[#4DA3FF] font-semibold"
              >
                {char}
              </span>
            ) : (
              <span key={idx}>•</span>
            )
          )}
        </div>
      )}

      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="text"
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        value={value}
        onChange={handleChange}
        onScroll={syncOverlayScroll}
        onKeyUp={syncOverlayScroll}
        onClick={syncOverlayScroll}
        placeholder={placeholder}
        className={`w-full h-12 pl-4 pr-12 rounded-2xl border border-neutral-200 dark:border-white/15 bg-neutral-50/70 dark:bg-[#1D1D1F] font-mono text-base tracking-normal placeholder:font-sans placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:bg-[#FDFDFD] dark:focus:bg-[#1D1D1F] focus:border-[#0A4DA8] dark:focus:border-[#4DA3FF] focus:ring-2 focus:ring-[#0A4DA8]/15 dark:focus:ring-[#4DA3FF]/20 transition ${
          showFullPassword
            ? 'text-[#1D1D1F] dark:text-[#FDFDFD]'
            : value.length > 0
              ? 'text-transparent caret-[#0A4DA8] dark:caret-[#4DA3FF] selection:bg-[#0A4DA8]/20 dark:selection:bg-[#4DA3FF]/25 selection:text-transparent'
              : 'text-[#1D1D1F] dark:text-[#FDFDFD] caret-[#0A4DA8] dark:caret-[#4DA3FF]'
        }`}
      />

      <button
        type="button"
        onClick={handleToggleFullVisibility}
        aria-label={showFullPassword ? 'Hide password' : 'Show password'}
        title={showFullPassword ? 'Hide password' : 'Show password'}
        className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:text-[#1D1D1F] dark:hover:text-[#FDFDFD] hover:bg-neutral-200/50 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A4DA8] dark:focus-visible:ring-[#4DA3FF] transition"
      >
        {showFullPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function AuthView() {
  const { signUp, signIn, sessionNotice, clearSessionNotice } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [identifier, setIdentifier] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [indexNumber, setIndexNumber] = useState('');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  const hasTypedPassword = password.length > 0;
  const meetsMinLength = password.length >= MIN_PASSWORD_CHARS;
  const lengthProgressPct = Math.min(100, Math.round((password.length / MIN_PASSWORD_CHARS) * 100));

  function switchMode(nextMode: 'login' | 'signup') {
    setMode(nextMode);
    setErrorMsg(null);
    clearSessionNotice();
    setVerificationEmail(null);
    window.requestAnimationFrame(() => {
      firstFieldRef.current?.focus();
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    clearSessionNotice();

    if (mode === 'login') {
      if (!identifier.trim()) {
        setErrorMsg('Enter your index number or UCC email.');
        return;
      }
    } else {
      if (!fullName.trim()) {
        setErrorMsg('Enter your full name.');
        return;
      }
      if (!/^[^\s@]+@([a-z0-9-]+\.)*ucc\.edu\.gh$/i.test(email.trim())) {
        setErrorMsg('Use your UCC email address. It must end in ucc.edu.gh.');
        return;
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9/._-]{2,31}$/.test(indexNumber.replace(/\s+/g, ''))) {
        setErrorMsg('Enter a valid index number.');
        return;
      }
    }

    if (password.length < MIN_PASSWORD_CHARS) {
      setErrorMsg(`Password must be at least ${MIN_PASSWORD_CHARS} characters.`);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signup') {
        const outcome = await signUp({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          index_number: indexNumber.trim(),
          password,
        });
        if (outcome.status === 'verification_required') {
          setVerificationEmail(outcome.email);
          setPassword('');
        }
      } else {
        await signIn(identifier.trim(), password);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(
          mode === 'signup'
            ? 'Unable to create account right now. Please try again.'
            : 'Unable to sign in right now. Please try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh relative bg-[#F5F5F7] dark:bg-[#1D1D1F] text-[#1D1D1F] dark:text-[#FDFDFD] flex items-center justify-center p-4 sm:p-6 transition-colors">
      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-20">
        <ThemeToggle showLabel />
      </div>

      <main className="relative z-10 w-full max-w-5xl grid md:grid-cols-[minmax(0,1fr)_420px] gap-8 lg:gap-16 items-center">
        <section className="hidden md:block max-w-xl">
          <div className="flex items-center gap-4 mb-10">
            <BrandMark className="w-14 h-14" />
            <div className="leading-tight">
              <p className="font-display text-lg font-bold text-[#1B2A44] dark:text-[#FDFDFD]">
                University of Cape Coast
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                College of Distance Education
              </p>
            </div>
          </div>
          <h2 className="font-display text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] text-[#1D1D1F] dark:text-[#FDFDFD]">
            Online examinations,
            <br />
            done properly.
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-neutral-600 dark:text-neutral-300">
            Take your quizzes and end-of-semester exams from anywhere. Sign in with your UCC student email.
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-2 gap-x-8 gap-y-5 border-t border-neutral-300/70 dark:border-white/10 pt-6 text-sm">
            <div>
              <dt className="font-semibold text-[#1D1D1F] dark:text-[#FDFDFD]">Timed exams</dt>
              <dd className="mt-1 text-neutral-600 dark:text-neutral-400">Each exam has a clear start, duration and deadline.</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#1D1D1F] dark:text-[#FDFDFD]">Marked by lecturers</dt>
              <dd className="mt-1 text-neutral-600 dark:text-neutral-400">Written answers are read and scored by your lecturer.</dd>
            </div>
          </dl>
        </section>
        <div className="rounded-[28px] bg-[#FDFDFD] dark:bg-[#1C1D21] border border-neutral-200/90 dark:border-white/10 shadow-[0_24px_64px_-24px_rgba(22,22,22,0.10)] dark:shadow-[0_28px_70px_-24px_rgba(0,0,0,0.75)] p-7 sm:p-9">
          <div className="flex flex-col items-center text-center mb-7">
            <BrandMark className="w-14 h-14 mb-5 shadow-xs" />

            <h1 className="font-display text-2xl sm:text-[26px] leading-[1.18] tracking-tight">
              <span className="block text-sm font-medium text-neutral-500 dark:text-neutral-400">
                University of Cape Coast
              </span>
              <span className="block font-bold text-[#1D1D1F] dark:text-[#FDFDFD] mt-0.5">
                CDE Exams
              </span>
            </h1>

            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2.5">
              {mode === 'login'
                ? 'Sign in to start or continue your exam'
                : 'Register with your UCC student email'}
            </p>
          </div>

          {sessionNotice && (
            <div className="mb-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-4 py-3 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
              {sessionNotice}
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="mb-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-4 py-3 text-xs sm:text-sm text-rose-800 dark:text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          {verificationEmail ? (
            <div role="status" className="rounded-2xl border border-[#0A4DA8]/20 bg-[#EAF3FF] dark:bg-[#4DA3FF]/10 dark:border-[#4DA3FF]/30 p-5 text-sm leading-relaxed text-[#1D1D1F] dark:text-[#FDFDFD]">
              <p className="font-semibold">Check your UCC inbox</p>
              <p className="mt-2 text-neutral-700 dark:text-neutral-300">
                We sent a confirmation link to <span className="font-medium">{verificationEmail}</span>. Open it to
                activate your account, then sign in with your index number or email.
              </p>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="mt-4 w-full min-h-[48px] rounded-2xl bg-[#0A4DA8] hover:bg-[#083E86] dark:bg-[#4DA3FF] dark:hover:bg-[#3D94F0] text-white dark:text-[#1D1D1F] text-sm font-semibold transition"
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'login' ? (
              <div>
                <label htmlFor="cde-identifier" className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Index number or UCC email
                </label>
                <input ref={firstFieldRef}
                  id="cde-identifier"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. PS/CSC/22/0001 or name@stu.ucc.edu.gh"
                  className="w-full h-12 px-4 rounded-2xl border border-neutral-200 dark:border-white/15 bg-neutral-50/70 dark:bg-[#1D1D1F] text-base text-[#1D1D1F] dark:text-[#FDFDFD] placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:bg-[#FDFDFD] dark:focus:bg-[#1D1D1F] focus:border-[#0A4DA8] dark:focus:border-[#4DA3FF] focus:ring-2 focus:ring-[#0A4DA8]/15 dark:focus:ring-[#4DA3FF]/20 transition"
                />
              </div>
            ) : (
              <>
              <div>
                <label htmlFor="cde-fullname" className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Full name
                </label>
                <input ref={firstFieldRef}
                  id="cde-fullname"
                  type="text"
                  autoComplete="name"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="As it appears on your records"
                  className="w-full h-12 px-4 rounded-2xl border border-neutral-200 dark:border-white/15 bg-neutral-50/70 dark:bg-[#1D1D1F] text-base text-[#1D1D1F] dark:text-[#FDFDFD] placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:bg-[#FDFDFD] dark:focus:bg-[#1D1D1F] focus:border-[#0A4DA8] dark:focus:border-[#4DA3FF] focus:ring-2 focus:ring-[#0A4DA8]/15 dark:focus:ring-[#4DA3FF]/20 transition"
                />
              </div>
              <div>
                <label htmlFor="cde-email" className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  UCC email
                </label>
                <input
                  id="cde-email"
                  type="text"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@stu.ucc.edu.gh"
                  className="w-full h-12 px-4 rounded-2xl border border-neutral-200 dark:border-white/15 bg-neutral-50/70 dark:bg-[#1D1D1F] text-base text-[#1D1D1F] dark:text-[#FDFDFD] placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:bg-[#FDFDFD] dark:focus:bg-[#1D1D1F] focus:border-[#0A4DA8] dark:focus:border-[#4DA3FF] focus:ring-2 focus:ring-[#0A4DA8]/15 dark:focus:ring-[#4DA3FF]/20 transition"
                />
              <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">Must end in ucc.edu.gh.</p>
              </div>
              <div>
                <label htmlFor="cde-index" className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Index number
                </label>
                <input
                  id="cde-index"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={indexNumber}
                  onChange={(e) => setIndexNumber(e.target.value)}
                  placeholder="e.g. PS/CSC/22/0001"
                  className="w-full h-12 px-4 rounded-2xl border border-neutral-200 dark:border-white/15 bg-neutral-50/70 dark:bg-[#1D1D1F] text-base text-[#1D1D1F] dark:text-[#FDFDFD] placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:bg-[#FDFDFD] dark:focus:bg-[#1D1D1F] focus:border-[#0A4DA8] dark:focus:border-[#4DA3FF] focus:ring-2 focus:ring-[#0A4DA8]/15 dark:focus:ring-[#4DA3FF]/20 transition"
                />
              </div>
              </>
            )}

            <div>
              <label
                htmlFor="cde-password"
                className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5"
              >
                Password
              </label>
              <PeekPasswordInput
                id="cde-password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="Enter your password"
              />

              {hasTypedPassword && (
                <div className="mt-2.5 space-y-1.5" aria-live="polite">
                  <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        meetsMinLength
                          ? 'bg-[#0A4DA8] dark:bg-[#4DA3FF]'
                          : 'bg-neutral-500 dark:bg-neutral-400'
                      }`}
                      style={{ width: `${lengthProgressPct}%` }}
                    />
                  </div>
                  <div
                    className={`flex items-center gap-1.5 text-xs font-medium ${
                      meetsMinLength
                        ? 'text-[#0A4DA8] dark:text-[#4DA3FF]'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {meetsMinLength ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="tabular-nums">
                      {meetsMinLength
                        ? `At least 8 characters (${password.length})`
                        : `At least 8 characters (${password.length}/${MIN_PASSWORD_CHARS})`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[50px] mt-2 rounded-2xl bg-[#0A4DA8] hover:bg-[#083E86] dark:bg-[#4DA3FF] dark:hover:bg-[#3D94F0] active:scale-[0.99] text-[#FDFDFD] dark:text-[#1D1D1F] font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-60 whitespace-nowrap"
            >
              <span>
                {isSubmitting
                  ? mode === 'signup'
                    ? 'Registering...'
                    : 'Signing in...'
                  : mode === 'signup'
                    ? 'Register'
                    : 'Sign In'}
              </span>
              {!isSubmitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5" aria-hidden="true">
            <div className="h-px flex-1 bg-neutral-200 dark:bg-white/10" />
            <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">or</span>
            <div className="h-px flex-1 bg-neutral-200 dark:bg-white/10" />
          </div>

          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            className="w-full min-h-[48px] rounded-2xl border border-neutral-200 dark:border-white/15 bg-neutral-50/80 dark:bg-white/[0.04] hover:bg-neutral-100 dark:hover:bg-white/[0.08] text-[#1D1D1F] dark:text-[#FDFDFD] text-sm font-semibold transition whitespace-nowrap"
          >
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
