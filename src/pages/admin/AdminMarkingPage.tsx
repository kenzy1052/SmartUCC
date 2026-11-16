import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, PenLine } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { GlassCard } from '../../components/common/GlassCard.tsx';
import { useNotification } from '../../components/common/GlobalNotification.tsx';

interface ExamSummary {
  exam_id: string;
  title: string;
  require_marking_approval: boolean;
  results_total: number;
  results_approved: number;
  pending_items: number;
}

interface QueueItem {
  result_id: string;
  question_id: string;
  exam_id: string;
  exam_title: string;
  student_name: string;
  student_identifier: string | null;
  question_text: string;
  max_marks: number;
  submitted_text: string;
  marking_guide: string | null;
}

const inputCls =
  'w-full rounded-xl border border-neutral-200 dark:border-white/15 bg-neutral-50/70 dark:bg-[#1D1D1F] text-sm focus:outline-none focus:ring-2 focus:ring-[#0A4DA8]/20 dark:focus:ring-[#4DA3FF]/25 focus:border-[#0A4DA8] dark:focus:border-[#4DA3FF]';

function MarkCard({ item, onSaved }: { item: QueueItem; onSaved: () => void }) {
  const { notify } = useNotification();
  const [marks, setMarks] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const max = Number(item.max_marks);
  const value = Number(marks);
  const valid = marks !== '' && Number.isFinite(value) && value >= 0 && value <= max;

  async function save() {
    if (!valid) return;
    try {
      setSaving(true);
      await apiRequest(`/admin/results/${item.result_id}/items/${item.question_id}/mark`, {
        method: 'POST',
        body: { marks_awarded: value, comment: comment.trim() || null },
      });
      notify({ type: 'success', message: `Marked ${item.student_name}.` });
      onSaved();
    } catch (err: any) {
      notify({ type: 'error', message: err?.message || 'Could not save the marks.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-semibold text-[#1D1D1F] dark:text-[#FDFDFD]">{item.student_name}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {item.student_identifier || 'No index number'} · {item.exam_title}
          </p>
        </div>
        <span className="text-xs font-semibold text-neutral-500">Out of {max}</span>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Question</p>
        <p className="text-sm whitespace-pre-wrap text-[#1D1D1F] dark:text-[#FDFDFD]">{item.question_text}</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Student's answer</p>
        <div className="rounded-xl bg-[#F5F5F7] dark:bg-white/5 p-3 text-sm whitespace-pre-wrap text-[#1D1D1F] dark:text-[#FDFDFD]">
          {item.submitted_text}
        </div>
      </div>

      {item.marking_guide ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Marking guide</p>
          <p className="text-sm whitespace-pre-wrap text-neutral-600 dark:text-neutral-300">{item.marking_guide}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 items-start">
        <div>
          <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">Marks</label>
          <input
            type="number"
            min={0}
            max={max}
            step={0.5}
            inputMode="decimal"
            value={marks}
            onChange={(e) => setMarks(e.target.value)}
            className={`${inputCls} h-11 px-3`}
          />
          <div className="mt-2 flex gap-1.5">
            {[0, max / 2, max].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMarks(String(m))}
                className="flex-1 h-8 rounded-lg border border-neutral-300 dark:border-white/15 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-white/5"
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
            Comment for the student (optional)
          </label>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className={`${inputCls} p-3`}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {marks !== '' && !valid ? (
          <span className="text-xs text-red-600 dark:text-red-400">Enter a number from 0 to {max}.</span>
        ) : null}
        <button
          type="button"
          disabled={!valid || saving}
          onClick={save}
          className="min-h-[44px] px-5 rounded-xl bg-[#0A4DA8] hover:bg-[#083E86] text-white dark:bg-[#4DA3FF] dark:hover:bg-[#3D94F0] dark:text-[#1D1D1F] text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save marks'}
        </button>
      </div>
    </GlassCard>
  );
}

export function AdminMarkingPage() {
  const { notify } = useNotification();
  const [summary, setSummary] = useState<ExamSummary[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [examFilter, setExamFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyExam, setBusyExam] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, q] = await Promise.all([
        apiRequest<ExamSummary[]>('/admin/marking/summary'),
        apiRequest<QueueItem[]>(`/admin/marking/queue${examFilter ? `?exam_id=${examFilter}` : ''}`),
      ]);
      setSummary(Array.isArray(s) ? s : []);
      setQueue(Array.isArray(q) ? q : []);
    } catch (err: any) {
      notify({ type: 'error', message: err?.message || 'Could not load marking.' });
    } finally {
      setLoading(false);
    }
  }, [examFilter, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPending = useMemo(() => summary.reduce((n, e) => n + Number(e.pending_items), 0), [summary]);

  async function toggleApproval(exam: ExamSummary, required: boolean) {
    try {
      setBusyExam(exam.exam_id);
      await apiRequest(`/admin/exams/${exam.exam_id}/marking-approval`, { method: 'PUT', body: { required } });
      await load();
    } catch (err: any) {
      notify({ type: 'error', message: err?.message || 'Could not update the setting.' });
    } finally {
      setBusyExam(null);
    }
  }

  async function approve(exam: ExamSummary) {
    try {
      setBusyExam(exam.exam_id);
      const r = await apiRequest<{ approved: number; held_for_marking: number }>(
        `/admin/exams/${exam.exam_id}/approve-results`,
        { method: 'POST', body: {} }
      );
      notify({
        type: 'success',
        message:
          `${r.approved} result${r.approved === 1 ? '' : 's'} approved.` +
          (r.held_for_marking ? ` ${r.held_for_marking} still waiting for marking.` : ''),
      });
      await load();
    } catch (err: any) {
      notify({ type: 'error', message: err?.message || 'Could not approve results.' });
    } finally {
      setBusyExam(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1D1D1F] dark:text-[#FDFDFD]">
          Marking &amp; approval
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Read and mark written answers. Students cannot see a result while any of their written answers is
          unmarked. If you switch on approval for an exam, they also wait until you approve.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Exams</h2>
        {loading ? (
          <div className="py-8 flex items-center text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        ) : summary.length === 0 ? (
          <GlassCard className="p-6 text-sm text-neutral-500">No submitted exams yet.</GlassCard>
        ) : (
          summary.map((e) => (
            <GlassCard key={e.exam_id} className="p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                <div>
                  <p className="font-semibold text-[#1D1D1F] dark:text-[#FDFDFD]">{e.title}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {Number(e.pending_items)} awaiting marking · {e.results_approved} of {e.results_total} results
                    approved
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={e.require_marking_approval}
                      disabled={busyExam === e.exam_id}
                      onChange={(ev) => toggleApproval(e, ev.target.checked)}
                      className="w-4 h-4 accent-[#0A4DA8]"
                    />
                    Require my approval before students see marks
                  </label>
                  <button
                    type="button"
                    disabled={busyExam === e.exam_id || e.results_approved >= e.results_total}
                    onClick={() => approve(e)}
                    className="min-h-[44px] px-4 rounded-xl border border-[#0A4DA8] text-[#0A4DA8] dark:border-[#4DA3FF] dark:text-[#4DA3FF] text-sm font-semibold hover:bg-[#EAF3FF] dark:hover:bg-[#4DA3FF]/10 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve ready results
                  </button>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 inline-flex items-center gap-2">
            <PenLine className="w-4 h-4" /> Written answers to mark ({queue.length})
          </h2>
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className={`${inputCls} h-10 px-3 sm:w-64`}
            aria-label="Filter by exam"
          >
            <option value="">All exams ({totalPending})</option>
            {summary.map((e) => (
              <option key={e.exam_id} value={e.exam_id}>
                {e.title} ({Number(e.pending_items)})
              </option>
            ))}
          </select>
        </div>

        {!loading && queue.length === 0 ? (
          <GlassCard className="p-8 text-center text-sm text-neutral-500">
            Nothing waiting. All written answers are marked.
          </GlassCard>
        ) : (
          queue.map((item) => (
            <MarkCard key={`${item.result_id}:${item.question_id}`} item={item} onSaved={load} />
          ))
        )}
      </section>
    </div>
  );
}
