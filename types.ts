
export interface EnrollmentData {
  userId: string;
  fullName: string;
  image: Blob;
  // shift settings (24h time, local kiosk timezone)
  shiftStart?: string;   // e.g. "09:00"
  shiftEnd?: string;     // e.g. "18:00"
  graceMinutes?: number; // e.g. 10
}

export interface EnrollmentResponse {
  ok: true;
  user_id: string;
  image: string; // GCS URI
  embeddings_count: number;
}

export interface MarkAttendanceSuccessResponse {
  ok: true;
  user_id: string;
  name: string;
  similarity: number;
  image: string; // GCS URI
  checkType?: 'IN' | 'OUT';
  status?: 'ON_TIME' | 'LATE' | 'EARLY';
  lateMinutes?: number;
}

export interface MarkAttendanceFailureResponse {
  ok: false;
  reason: 'NO_MATCH' | 'MULTIPLE_FACES' | 'NO_FACE' | 'DAY_COMPLETED' | 'TOO_SOON';
  similarity?: number;
  image?: string;
}

export type MarkAttendanceResponse = MarkAttendanceSuccessResponse | MarkAttendanceFailureResponse;

export interface ApiError {
  detail: string;
}

export interface EnrolledUser {
  userId: string;
  fullName: string;
  imageBase64: string;
  // optional shift settings from backend
  shiftStart?: string;
  shiftEnd?: string;
  graceMinutes?: number;
}

// PocketBase-backed shift management
export interface Shift {
  id: string;
  name: string;
  active: boolean;
  start?: string; // ISO string
  end?: string;   // ISO string
}

// PocketBase-backed attendance log
export interface AttendanceLog {
  id: string;
  userId?: string; // present on SUCCESS
  result: 'SUCCESS' | 'NO_MATCH' | 'NO_FACE' | 'MULTIPLE_FACES';
  similarity?: number;
  kioskDeviceId?: string;
  imageUrl?: string;
  shiftId?: string;
  created?: string;
  // new fields for scheduling & status
  checkType?: 'IN' | 'OUT';
  status?: 'ON_TIME' | 'LATE' | 'EARLY';
  scheduledStart?: string; // ISO
  scheduledEnd?: string;   // ISO
  eventTime?: string;      // ISO
}
