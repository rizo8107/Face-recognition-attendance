import React, { useEffect, useMemo, useState } from 'react';
import { getPb } from '../services/pbClient';
import { C_ATTENDANCE, C_ENROLLED } from '../services/backendService';
import type { RecordModel } from 'pocketbase';
import { pairDailyInOut, aggregateKPIs, groupByYmd, toCsv, type DailyRow } from '../services/reportService';
import Button from './common/Button';
import Alert from './common/Alert';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Legend, Tooltip } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Legend, Tooltip);

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

const DashboardView: React.FC = () => {
  const [start, setStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return toIsoDate(d);
  });
  const [end, setEnd] = useState<string>(() => toIsoDate(new Date()));
  const [userFilter, setUserFilter] = useState<string>('');
  const [users, setUsers] = useState<RecordModel[]>([]);
  const [logs, setLogs] = useState<RecordModel[]>([]);
  const [error, setError] = useState<string | null>(null);

  // simple retry helper
  async function withRetry<T>(fn: () => Promise<T>, tries = 3, delayMs = 300): Promise<T> {
    try { return await fn(); } catch (e) {
      if (tries <= 1) throw e;
      await new Promise(r => setTimeout(r, delayMs));
      return withRetry(fn, tries - 1, Math.min(1000, delayMs * 2));
    }
  }

  // Load users
  useEffect(() => {
    (async () => {
      try {
        const pb = getPb();
        const list = await withRetry(() => pb.collection(C_ENROLLED).getFullList<RecordModel>({ batch: 500, sort: '+userId', $autoCancel: false as any }));
        setUsers(list);
      } catch (e) {
        setError('Failed to load users');
      }
    })();
  }, []);

  // Load logs for range and user
  const loadLogs = async () => {
    try {
      setError(null);
      const pb = getPb();
      const startIso = new Date(start + 'T00:00:00.000Z').toISOString();
      const endIso = new Date(end + 'T23:59:59.999Z').toISOString();
      const filters: string[] = [
        `created >= "${startIso}"`,
        `created <= "${endIso}"`
      ];
      if (userFilter) filters.push(`user = "${userFilter}"`);
      const filter = filters.join(' && ');
      const list = await withRetry(() => pb.collection(C_ATTENDANCE).getFullList<RecordModel>({ batch: 1000, filter, sort: '+created', $autoCancel: false as any }));
      setLogs(list);
    } catch (e: any) {
      const msg = (e && (e.message || e.toString())) || 'unknown';
      setError(`Failed to load attendance logs (${msg})`);
    }
  };

  useEffect(() => { loadLogs(); }, [start, end, userFilter]);

  // Realtime subscribe
  useEffect(() => {
    const pb = getPb();
    const unsubPromise = pb.collection(C_ATTENDANCE).subscribe('*', () => {
      // If a record falls in the range and matches user filter, reload
      loadLogs();
    });
    return () => { unsubPromise.then(unsub => unsub()).catch(() => {}); };
  }, [start, end, userFilter]);

  const usersById = useMemo(() => {
    const m = new Map<string, { userId: string; fullName: string }>();
    for (const u of users) m.set(u.id, { userId: (u as any).userId, fullName: (u as any).fullName });
    return m;
  }, [users]);

  const dailyRows: DailyRow[] = useMemo(() => pairDailyInOut(logs, usersById), [logs, usersById]);
  const kpis = useMemo(() => aggregateKPIs(dailyRows), [dailyRows]);
  const byDay = useMemo(() => groupByYmd(dailyRows), [dailyRows]);

  const chartDays = Array.from(byDay.keys()).sort();
  const lateSeries = chartDays.map(d => (byDay.get(d) || []).filter(r => r.statusIn === 'LATE').length);
  const onTimeSeries = chartDays.map(d => (byDay.get(d) || []).filter(r => r.statusIn === 'ON_TIME').length);
  const durationSeries = chartDays.map(d => (byDay.get(d) || []).reduce((s, r) => s + r.durationMin, 0));

  // Today's merged rows including absentees
  const today = toIsoDate(new Date());
  const todayRows = useMemo(() => {
    const todays = dailyRows.filter(r => r.date === today);
    const map = new Map<string, DailyRow>();
    for (const r of todays) map.set(r.userId, r);
    const merged: Array<DailyRow & { __absent?: boolean }> = [];
    for (const u of users) {
      const uid = (u as any).userId as string;
      const full = (u as any).fullName as string;
      const found = map.get(uid);
      if (found) merged.push(found);
      else merged.push({ date: today, userId: uid, fullName: full, durationMin: 0, __absent: true });
    }
    // sort by absent first then name
    merged.sort((a,b) => (a.__absent?1:0) - (b.__absent?1:0) || a.fullName.localeCompare(b.fullName));
    return merged;
  }, [dailyRows, users]);

  const barData = {
    labels: chartDays,
    datasets: [
      { label: 'On-time', data: onTimeSeries, backgroundColor: 'rgba(34,197,94,0.6)' },
      { label: 'Late', data: lateSeries, backgroundColor: 'rgba(239,68,68,0.6)' },
    ],
  };
  const lineData = {
    labels: chartDays,
    datasets: [
      { label: 'Total Duration (min)', data: durationSeries, borderColor: 'rgba(59,130,246,1)', backgroundColor: 'rgba(59,130,246,0.2)' },
    ],
  };

  const exportCsv = () => {
    const csv = toCsv(dailyRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${start}_to_${end}${userFilter ? `_${usersById.get(userFilter)?.userId}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Today's quick report */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-200 text-slate-700 font-semibold">Today's Quick Report</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Check-in</th>
                <th className="px-4 py-2">Check-out</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {todayRows.map((r, idx) => (
                <tr key={`today-${idx}`} className="border-b border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{r.userId} - {r.fullName}</td>
                  <td className="px-4 py-2 text-slate-700">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—'}</td>
                  <td className="px-4 py-2 text-slate-700">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—'}</td>
                  <td className="px-4 py-2 text-slate-700">{Math.floor(r.durationMin/60)}h {r.durationMin%60}m</td>
                  <td className="px-4 py-2">{(r as any).__absent ? <span className="text-rose-600 font-medium">Absent</span> : <span className="text-emerald-600">Present</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1" htmlFor="startDate">Start</label>
          <input id="startDate" aria-label="Start date" type="date" value={start} onChange={e => setStart(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1" htmlFor="endDate">End</label>
          <input id="endDate" aria-label="End date" type="date" value={end} onChange={e => setEnd(e.target.value)} className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800" />
        </div>
        <div className="min-w-[220px]">
          <label className="block text-xs text-slate-500 mb-1" htmlFor="userFilter">User</label>
          <select id="userFilter" aria-label="User filter" value={userFilter} onChange={e => setUserFilter(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800">
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{(u as any).userId} - {(u as any).fullName}</option>
            ))}
          </select>
        </div>
        <Button onClick={loadLogs}>Refresh</Button>
        <Button onClick={exportCsv} className="bg-emerald-600 hover:bg-emerald-500">Export CSV</Button>
      </div>

      {error && <Alert type="error" title="Error">{error}</Alert>}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="text-slate-500">On-time</div><div className="text-2xl font-bold text-emerald-600">{kpis.onTime}</div></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="text-slate-500">Late</div><div className="text-2xl font-bold text-rose-600">{kpis.late}</div></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="text-slate-500">Early Check-out</div><div className="text-2xl font-bold text-amber-600">{kpis.earlyOut}</div></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="text-slate-500">Avg Duration</div><div className="text-2xl font-bold text-sky-600">{kpis.avgMin} min</div></div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-slate-700 font-semibold mb-2">Daily On-time vs Late</div>
          <Bar data={barData} options={{ responsive: true, plugins: { legend: { labels: { color: '#334155' } } }, scales: { x: { ticks: { color: '#64748b' } }, y: { ticks: { color: '#64748b' } } } }} />
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-slate-700 font-semibold mb-2">Total Duration (min) by Day</div>
          <Line data={lineData} options={{ responsive: true, plugins: { legend: { labels: { color: '#334155' } } }, scales: { x: { ticks: { color: '#64748b' } }, y: { ticks: { color: '#64748b' } } } }} />
        </div>
      </div>

      {/* Daily table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-200 text-slate-700 font-semibold">Daily Details</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Check-in</th>
                <th className="px-4 py-2">Check-out</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">IN Status</th>
                <th className="px-4 py-2">OUT Status</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((r, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{r.date}</td>
                  <td className="px-4 py-2 text-slate-700">{r.userId} - {r.fullName}</td>
                  <td className="px-4 py-2 text-slate-700">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—'}</td>
                  <td className="px-4 py-2 text-slate-700">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—'}</td>
                  <td className="px-4 py-2 text-slate-700">{Math.floor(r.durationMin/60)}h {r.durationMin%60}m</td>
                  <td className={`px-4 py-2 ${r.statusIn === 'LATE' ? 'text-rose-600' : 'text-emerald-600'}`}>{r.statusIn || '—'}</td>
                  <td className={`px-4 py-2 ${r.statusOut === 'EARLY' ? 'text-amber-600' : 'text-emerald-600'}`}>{r.statusOut || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
