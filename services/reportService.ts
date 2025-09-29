import type { AttendanceLog } from '../types';
import type { RecordModel } from 'pocketbase';

export interface DailyRow {
  date: string; // YYYY-MM-DD
  userId: string;
  fullName: string;
  checkIn?: string;  // ISO
  checkOut?: string; // ISO
  durationMin: number; // computed from in/out
  statusIn?: 'ON_TIME' | 'LATE';
  statusOut?: 'ON_TIME' | 'EARLY';
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function pairDailyInOut(logs: RecordModel[], usersById: Map<string, { userId: string; fullName: string }>): DailyRow[] {
  // group by user + date (created in ISO)
  const grouped = new Map<string, RecordModel[]>();
  for (const l of logs) {
    if ((l as any).result !== 'SUCCESS') continue;
    const created = new Date((l as any).created || (l as any).eventTime || new Date().toISOString());
    const key = `${(l as any).user}|${toYmd(created)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(l);
  }
  const rows: DailyRow[] = [];
  for (const [key, arr] of grouped.entries()) {
    arr.sort((a,b) => new Date((a as any).created).getTime() - new Date((b as any).created).getTime());
    const [userRecordId, date] = key.split('|');
    const userMeta = usersById.get(userRecordId || '') || { userId: '', fullName: '' };
    // Find first IN and next OUT
    let checkIn: RecordModel | undefined;
    let checkOut: RecordModel | undefined;
    for (const r of arr) {
      const ct = (r as any).checkType as 'IN' | 'OUT' | undefined;
      if (!checkIn && ct === 'IN') checkIn = r;
      else if (checkIn && ct === 'OUT') { checkOut = r; break; }
    }
    const inTime = checkIn ? new Date((checkIn as any).eventTime || (checkIn as any).created).toISOString() : undefined;
    const outTime = checkOut ? new Date((checkOut as any).eventTime || (checkOut as any).created).toISOString() : undefined;
    let durationMin = 0;
    if (inTime && outTime) {
      durationMin = Math.max(0, Math.round((new Date(outTime).getTime() - new Date(inTime).getTime())/60000));
    }
    const statusIn = checkIn ? ((checkIn as any).status === 'LATE' ? 'LATE' : 'ON_TIME') : undefined;
    const statusOut = checkOut ? ((checkOut as any).status === 'EARLY' ? 'EARLY' : 'ON_TIME') : undefined;
    rows.push({
      date,
      userId: userMeta.userId,
      fullName: userMeta.fullName,
      checkIn: inTime,
      checkOut: outTime,
      durationMin,
      statusIn,
      statusOut,
    });
  }
  return rows;
}

export function aggregateKPIs(rows: DailyRow[]) {
  const days = rows.length;
  const onTime = rows.filter(r => r.statusIn === 'ON_TIME').length;
  const late = rows.filter(r => r.statusIn === 'LATE').length;
  const earlyOut = rows.filter(r => r.statusOut === 'EARLY').length;
  const totalMin = rows.reduce((s, r) => s + (r.durationMin || 0), 0);
  const avgMin = days ? Math.round(totalMin / days) : 0;
  return { onTime, late, earlyOut, totalMin, avgMin };
}

export function groupByYmd(rows: DailyRow[]) {
  const m = new Map<string, DailyRow[]>();
  for (const r of rows) {
    if (!m.has(r.date)) m.set(r.date, []);
    m.get(r.date)!.push(r);
  }
  return m;
}

export function toCsv(rows: DailyRow[]): string {
  const header = ['Date','User ID','Full Name','Check-in','Check-out','Duration (min)','IN Status','OUT Status'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.date,
      r.userId,
      r.fullName,
      r.checkIn || '',
      r.checkOut || '',
      r.durationMin,
      r.statusIn || '',
      r.statusOut || '',
    ].map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v)).join(','));
  }
  return lines.join('\n');
}
