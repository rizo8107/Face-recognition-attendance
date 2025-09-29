import PocketBase, { RecordModel } from 'pocketbase';
import { getPb } from './pbClient';
import type { EnrolledUser } from '../types';

// Collection names
export const C_ENROLLED = 'enrolled_users';
export const C_SHIFTS = 'shifts';
export const C_ATTENDANCE = 'attendance_logs';

export async function listEnrolledUsers(): Promise<EnrolledUser[]> {
  const pb = getPb();
  const records = await pb.collection(C_ENROLLED).getFullList<RecordModel>({ batch: 200, sort: '+userId' });
  return records.map(r => ({
    userId: r.userId as string,
    fullName: r.fullName as string,
    imageBase64: '', // caller may fetch image via URL and convert if needed
  }));
}

// For building local candidate index (includes image filename and record id)
export async function listAllEnrolledRecords(): Promise<RecordModel[]> {
  const pb = getPb();
  const records = await pb.collection(C_ENROLLED).getFullList<RecordModel>({ batch: 1000, sort: '+userId' });
  return records;
}

export function getFileUrl(record: RecordModel, fileName: string): string {
  const pb = getPb();
  return pb.files.getUrl(record, fileName);
}

export async function findEnrolledByUserId(userId: string): Promise<RecordModel | null> {
  const pb = getPb();
  const list = await pb.collection(C_ENROLLED).getList(1, 1, { filter: `userId = "${userId}"` });
  return list.items[0] || null;
}

export async function createEnrolledUser(
  userId: string,
  fullName: string,
  image: Blob,
  opts?: { shiftStart?: string; shiftEnd?: string; graceMinutes?: number }
): Promise<RecordModel> {
  const pb = getPb();
  const form = new FormData();
  form.append('userId', userId);
  form.append('fullName', fullName);
  form.append('image', image, `${userId}.jpg`);
  if (opts?.shiftStart) form.append('shiftStart', opts.shiftStart);
  if (opts?.shiftEnd) form.append('shiftEnd', opts.shiftEnd);
  if (typeof opts?.graceMinutes === 'number') form.append('graceMinutes', String(opts.graceMinutes));
  const rec = await pb.collection(C_ENROLLED).create(form);
  return rec as RecordModel;
}

export async function deleteEnrolledUserById(userId: string): Promise<void> {
  const pb = getPb();
  const rec = await findEnrolledByUserId(userId);
  if (rec) {
    await pb.collection(C_ENROLLED).delete(rec.id);
  }
}

export async function getActiveShift(): Promise<RecordModel | null> {
  const pb = getPb();
  const list = await pb.collection(C_SHIFTS).getList(1, 1, { filter: 'active = true', sort: '-created' });
  return list.items[0] || null;
}

export async function setActiveShift(name: string): Promise<RecordModel> {
  const pb = getPb();
  // Deactivate all
  const all = await pb.collection(C_SHIFTS).getFullList<RecordModel>({ batch: 200, filter: 'active = true' });
  await Promise.all(all.map(r => pb.collection(C_SHIFTS).update(r.id, { active: false })));
  // Create new and set active
  const rec = await pb.collection(C_SHIFTS).create({ name, active: true, start: new Date().toISOString() });
  return rec as RecordModel;
}

export async function logAttendance(params: {
  userRecord: RecordModel | null;
  similarity?: number;
  result: 'SUCCESS' | 'NO_MATCH' | 'NO_FACE' | 'MULTIPLE_FACES';
  kioskDeviceId?: string;
  image?: Blob;
  shiftRecord?: RecordModel | null;
  checkType?: 'IN' | 'OUT';
  status?: 'ON_TIME' | 'LATE' | 'EARLY';
  scheduledStart?: string; // ISO
  scheduledEnd?: string;   // ISO
  eventTime?: string;      // ISO
}): Promise<RecordModel> {
  const pb = getPb();
  const form = new FormData();
  if (params.userRecord) form.append('user', params.userRecord.id);
  if (params.similarity !== undefined) form.append('similarity', String(params.similarity));
  form.append('result', params.result);
  if (params.kioskDeviceId) form.append('kioskDeviceId', params.kioskDeviceId);
  if (params.image) form.append('image', params.image, 'capture.jpg');
  if (params.shiftRecord) form.append('shift', params.shiftRecord.id);
  if (params.checkType) form.append('checkType', params.checkType);
  if (params.status) form.append('status', params.status);
  if (params.scheduledStart) form.append('scheduledStart', params.scheduledStart);
  if (params.scheduledEnd) form.append('scheduledEnd', params.scheduledEnd);
  if (params.eventTime) form.append('eventTime', params.eventTime);
  const rec = await pb.collection(C_ATTENDANCE).create(form);
  return rec as RecordModel;
}

export async function listLogsForUserOnDate(userRecordId: string, date: Date): Promise<RecordModel[]> {
  const pb = getPb();
  const start = new Date(date);
  start.setHours(0,0,0,0);
  const end = new Date(date);
  end.setHours(23,59,59,999);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const filter = `user = "${userRecordId}" && created >= "${startIso}" && created <= "${endIso}"`;
  const list = await pb.collection(C_ATTENDANCE).getFullList<RecordModel>({ filter, sort: '+created' });
  return list;
}
