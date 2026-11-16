import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Award,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  PlayCircle,
  Hourglass,
  Calendar,
  Lock,
} from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { StudentEligibleExam, StartOrResumeAttemptResult } from '../../types/frontend.ts';
import { GlassCard } from '../../components/common/GlassCard.tsx';
import { useNotification } from '../../components/common/GlobalNotification.tsx';

export function StudentQuizDetailPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const { error: notifyError } = useNotification();

  const [exam, setExam] = useState<StudentEligibleExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadQuiz() {
      try {
        const exams = await apiRequest<StudentEligibleExam[]>('/student/exams');
        const found = exams.find((e) => e.id === quizId);
        if (active) {
          setExam(found || null);
        }
      } catch (err) {
        console.error('Failed to load exam details:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadQuiz();
    return () => {
      active = false;
    };
  }, [quizId]);

  async function handleStart() {
    if (!exam) return;
    if (exam.active_attempt_id) {
      navigate(`/student/exams/${exam.active_attempt_id}`);
      return;
    }

    setIsStarting(true);
    try {
      const res = await apiRequest<StartOrResumeAttemptResult>(
        `/student/exams/${exam.id}/attempts`,
        { method: 'POST' }
      );
      navigate(`/student/exams/${res.attempt_id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to start examination.';
      notifyError(msg, 'Start Failed');
    } finally {
      setIsStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#0A4DA8] dark:border-[#4DA3FF] border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-neutral-500">Loading exam overview...</p>
      </div>
    );
  }

  if (!exam) {
    return (
      <GlassCard className="text-center py-16 max-w-xl mx-auto">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#1D1D1F] dark:text-[#FDFDFD]">Examination Not Found</h2>
        <p className="text-sm text-neutral-500 mt-1 mb-6">
          This exam may not be assigned to your cohort or does not exist.
        </p>
        <button
          onClick={() => navigate('/student/quizzes')}
          className="px-4 py-2 rounded-xl bg-[#0A4DA8] dark:bg-[#4DA3FF] text-white dark:text-[#1D1D1F] text-xs font-semibold"
        >
          Return to Exams
        </button>
      </GlassCard>
    );
  }

  const isResume = exam.availability_state === 'in_progress' && exam.active_attempt_id;
  const isCooldown = exam.availability_state === 'cooldown';
  const isClosed = exam.availability_state === 'closed';
  const isExhausted = exam.availability_state === 'attempts_exhausted';

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Back Button */}
      <button
        onClick={() => navigate('/student/quizzes')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-[#0A4DA8] dark:hover:text-[#4DA3FF] transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Exams</span>
      </button>

      {/* Main Overview Card */}
      <GlassCard className="p-6 sm:p-8 space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-xl bg-blue-500/10 text-blue-800 dark:text-[#4DA3FF] dark:bg-[#4DA3FF]/10 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{exam.duration_minutes} Minutes Allowed</span>
            </span>

            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 px-3 py-1 rounded-xl glass-panel">
              Passing: {exam.passing_percentage}%
            </span>

            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 px-3 py-1 rounded-xl glass-panel">
              Attempts: {exam.attempts_used} / {exam.max_attempts}
            </span>
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1D1D1F] dark:text-[#FDFDFD]">
            {exam.title}
          </h1>

          {exam.description && (
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              {exam.description}
            </p>
          )}
        </div>

        {/* Rules & Instructions Box */}
        <div className="rounded-2xl p-5 bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-[#0A4DA8] dark:text-[#4DA3FF]" />
            <span>Official Examination Instructions</span>
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed whitespace-pre-line">
            {exam.instructions ||
              'Answer all questions to the best of your ability. Your answers will be automatically saved as you navigate between questions. The timer counts down strictly on the authoritative server deadline.'}
          </p>

          <ul className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1.5 pt-2 list-disc list-inside">
            <li>Immediate answer persistence: selections are saved securely to your session.</li>
            <li>Browser refresh protection: reloading restores the exact timer and answered state.</li>
            <li>Automatic submission occurs strictly if time expires before manual completion.</li>
          </ul>
        </div>

        {/* Cooldown Notice if applicable */}
        {isCooldown && exam.next_eligible_attempt_at && (
          <div className="rounded-2xl p-4 bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <Hourglass className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Retake Cooldown Active
              </h3>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Next attempt will unlock on{' '}
                <span className="font-semibold">
                  {new Date(exam.next_eligible_attempt_at).toLocaleString()}
                </span>
                . An administrator can also grant an instant override if necessary.
              </p>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-4 border-t border-neutral-200/70 dark:border-white/10 flex items-center justify-between gap-4">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {isClosed ? (
              <span className="text-rose-600 font-semibold">Exam is currently closed by lecturer</span>
            ) : isExhausted ? (
              <span className="text-neutral-500 font-semibold">All permitted attempts exhausted</span>
            ) : isCooldown ? (
              <span className="text-amber-600 font-semibold">Cooldown in effect</span>
            ) : isResume ? (
              <span className="text-blue-600 dark:text-[#4DA3FF] font-semibold">
                You have an active in-progress attempt
              </span>
            ) : (
              <span>Ready when you are</span>
            )}
          </div>

          <button
            onClick={handleStart}
            disabled={isStarting || isClosed || isExhausted || isCooldown}
            className={`px-6 py-3 rounded-2xl font-bold text-sm shadow-md transition-all flex items-center gap-2 ${
              isClosed || isExhausted || isCooldown
                ? 'bg-neutral-200 dark:bg-white/10 text-neutral-400 cursor-not-allowed'
                : isResume
                  ? 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-[1.02]'
                  : 'bg-[#0A4DA8] dark:bg-[#4DA3FF] text-white dark:text-[#1D1D1F] hover:bg-[#083E86] dark:hover:bg-[#3D94F0] hover:scale-[1.02]'
            }`}
          >
            <PlayCircle className="w-5 h-5" />
            <span>
              {isStarting
                ? 'Starting...'
                : isResume
                  ? 'Resume Examination'
                  : 'Begin Examination Now'}
            </span>
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
