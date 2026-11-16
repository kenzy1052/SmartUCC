import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Shield, UserCog } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { GlassCard } from '../../components/common/GlassCard.tsx';
import { useNotification } from '../../components/common/GlobalNotification.tsx';

interface ManagedUser {
  id: string;
  full_name: string;
  email: string;
  student_identifier: string | null;
  role: 'student' | 'lecturer' | 'admin';
  account_status: string;
}

type RoleFilter = 'all' | 'student' | 'lecturer' | 'admin';

const FILTERS: Array<{ key: RoleFilter; label: string }> = [
  { key: 'all', label: 'Everyone' },
  { key: 'student', label: 'Students' },
  { key: 'lecturer', label: 'Lecturers' },
  { key: 'admin', label: 'Admins' },
];

export function AdminUsersPage() {
  const { profile } = useAuth();
  const { notify } = useNotification();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest<ManagedUser[]>('/admin/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      notify({ type: 'error', message: err?.message || 'Could not load users.' });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== 'all' && u.role !== filter) return false;
      if (!q) return true;
      return [u.full_name, u.email, u.student_identifier ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [users, search, filter]);

  async function changeRole(user: ManagedUser, role: 'student' | 'lecturer') {
    try {
      setBusyId(user.id);
      await apiRequest(`/admin/users/${user.id}/role`, { method: 'PUT', body: { role } });
      notify({
        type: 'success',
        message: `${user.full_name} is now ${role === 'lecturer' ? 'a lecturer' : 'a student'}.`,
      });
      setPendingId(null);
      await load();
    } catch (err: any) {
      notify({ type: 'error', message: err?.message || 'Could not change the role.' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1D1D1F] dark:text-[#FDFDFD]">
          Users &amp; roles
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Everyone registers as a student. Promote staff to lecturer so they can create exams and mark
          answers. Lecturers cannot manage users, classes or the audit log.
        </p>
      </div>

      <GlassCard className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative sm:max-w-sm w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or index number"
              className="w-full h-11 pl-10 pr-3 rounded-xl border border-neutral-200 dark:border-white/15 bg-neutral-50/70 dark:bg-[#1D1D1F] text-sm focus:outline-none focus:ring-2 focus:ring-[#0A4DA8]/20 dark:focus:ring-[#4DA3FF]/25 focus:border-[#0A4DA8] dark:focus:border-[#4DA3FF]"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by role">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3.5 h-9 rounded-full text-xs font-semibold border transition ${
                  filter === f.key
                    ? 'bg-[#0A4DA8] text-white border-[#0A4DA8] dark:bg-[#4DA3FF] dark:text-[#1D1D1F] dark:border-[#4DA3FF]'
                    : 'border-neutral-300 dark:border-white/15 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading users...
          </div>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-500">No users match.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  <th className="py-2.5 px-3 font-semibold">Name</th>
                  <th className="py-2.5 px-3 font-semibold">Index number</th>
                  <th className="py-2.5 px-3 font-semibold">Role</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70 dark:divide-white/10">
                {visible.map((u) => {
                  const isSelf = u.id === profile?.id;
                  const canChange = u.role !== 'admin' && !isSelf;
                  const next = u.role === 'lecturer' ? 'student' : 'lecturer';
                  const confirming = pendingId === u.id;
                  return (
                    <tr key={u.id}>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#1D1D1F] dark:text-[#FDFDFD]">{u.full_name}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{u.email}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-neutral-600 dark:text-neutral-300">
                        {u.student_identifier || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold capitalize text-neutral-700 dark:text-neutral-300">
                          {u.role === 'admin' ? (
                            <Shield className="w-3.5 h-3.5 text-[#0A4DA8] dark:text-[#4DA3FF]" />
                          ) : u.role === 'lecturer' ? (
                            <UserCog className="w-3.5 h-3.5 text-[#0A4DA8] dark:text-[#4DA3FF]" />
                          ) : null}
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {!canChange ? (
                          <span className="text-xs text-neutral-400">{isSelf ? 'You' : '—'}</span>
                        ) : confirming ? (
                          <span className="inline-flex gap-2">
                            <button
                              type="button"
                              disabled={busyId === u.id}
                              onClick={() => changeRole(u, next)}
                              className="px-3 h-9 rounded-lg text-xs font-semibold bg-[#0A4DA8] text-white hover:bg-[#083E86] dark:bg-[#4DA3FF] dark:text-[#1D1D1F] dark:hover:bg-[#3D94F0] disabled:opacity-60"
                            >
                              {busyId === u.id ? 'Saving...' : `Confirm ${next}`}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingId(null)}
                              className="px-3 h-9 rounded-lg text-xs font-semibold border border-neutral-300 dark:border-white/15"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingId(u.id)}
                            className="px-3 h-9 rounded-lg text-xs font-semibold border border-neutral-300 dark:border-white/15 hover:bg-neutral-100 dark:hover:bg-white/5"
                          >
                            {u.role === 'lecturer' ? 'Make student' : 'Make lecturer'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
