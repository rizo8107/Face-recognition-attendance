import type { EnrollmentData, EnrollmentResponse, MarkAttendanceResponse, ApiError, EnrolledUser } from '../types';
import { listEnrolledUsers as pbListEnrolled, createEnrolledUser, deleteEnrolledUserById, getActiveShift, logAttendance, findEnrolledByUserId, listLogsForUserOnDate } from './backendService';
import { shortlistByBlob } from './candidateIndex';
import { getPb } from './pbClient';
import { KIOSK_DEVICE_ID } from '../constants';
import { faceDescriptorFromBlob, euclidean } from './faceEmbed';

// No external AI client needed; recognition is on-device using face-api descriptors

// Utilities
const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const fetchUrlToBase64 = async (url: string): Promise<string> => {
  const res = await fetch(url);
  const blob = await res.blob();
  return blobToBase64(blob);
};

// Note: Admin-only collection setup is disabled in client. Ensure collections via PocketBase Admin UI.

export const getEnrolledUsersList = async (): Promise<EnrolledUser[]> => {
  // Return array for UI; include base64 for compatibility
  const list = await pbListEnrolled();
  // We didn't include imageBase64 in backendService; fetch and attach now
  // Try to get image URL via an additional lookup per user
  const enriched: EnrolledUser[] = [];
  for (const u of list) {
    try {
      const rec = await findEnrolledByUserId(u.userId);
      if (rec && rec.image) {
        const url = getPb().files.getUrl(rec as any, (rec as any).image as string);
        const imageBase64 = await fetchUrlToBase64(url);
        enriched.push({ ...u, imageBase64 });
      } else {
        enriched.push(u);
      }
    } catch {
      enriched.push(u);
    }
  }
  return enriched;
};

export const deleteUser = async (userId: string): Promise<void> => {
  await deleteEnrolledUserById(userId);
};

export const enrollUser = async (data: EnrollmentData): Promise<EnrollmentResponse> => {
  if (!data.userId || !data.fullName) {
    throw { detail: 'User ID and Full Name are required.' } as ApiError;
  }
  try {
    const existing = await findEnrolledByUserId(data.userId);
    if (existing) {
      throw { detail: `User with ID ${data.userId} already exists.` } as ApiError;
    }
  } catch (e) {
    // if find fails for any reason other than found, continue
  }

  const rec = await createEnrolledUser(
    data.userId,
    data.fullName,
    data.image,
    {
      shiftStart: data.shiftStart,
      shiftEnd: data.shiftEnd,
      graceMinutes: data.graceMinutes,
    }
  );
  return {
    ok: true,
    user_id: data.userId,
    image: getPb().files.getUrl(rec as any, (rec as any).image as string),
    embeddings_count: 1,
  };
};

export const markAttendance = async (image: Blob, hintUserId?: string): Promise<MarkAttendanceResponse> => {
  const users = await pbListEnrolled();
  if (users.length === 0) {
    // Log NO_MATCH with shift
    const shift = await getActiveShift();
    await logAttendance({ userRecord: null, result: 'NO_MATCH', kioskDeviceId: KIOSK_DEVICE_ID, image, shiftRecord: shift });
    return { ok: false, reason: 'NO_MATCH', image: '' };
  }

  // Shortlist by lightweight signature; if hint provided, restrict to that user
  let candidates = await shortlistByBlob(image, 5);
  if (hintUserId) {
    const forced = candidates.find(c => c.userId === hintUserId);
    if (forced) {
      candidates = [forced];
    } else {
      try {
        const rec = await findEnrolledByUserId(hintUserId);
        if (rec && (rec as any).image) {
          const url = getPb().files.getUrl(rec as any, (rec as any).image as string);
          candidates = [{ recId: (rec as any).id, userId: hintUserId, fullName: (rec as any).fullName, imageUrl: url } as any];
        }
      } catch {}
    }
  }

  if (candidates.length === 0) {
    const shift = await getActiveShift();
    await logAttendance({ userRecord: null, result: 'NO_MATCH', kioskDeviceId: KIOSK_DEVICE_ID, image, shiftRecord: shift });
    return { ok: false, reason: 'NO_MATCH', image: '' };
  }

  try {
    // Local recognition using face-api descriptors
    const liveDesc = await faceDescriptorFromBlob(image);
    if (!liveDesc) {
      const shift = await getActiveShift();
      await logAttendance({ userRecord: null, result: 'NO_FACE', kioskDeviceId: KIOSK_DEVICE_ID, image, shiftRecord: shift });
      return { ok: false, reason: 'NO_FACE', image: '' };
    }

    // Evaluate candidates by Euclidean distance
    let bestUserId: string | 'NO_MATCH' = 'NO_MATCH';
    let bestDist = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      try {
        const res = await fetch(c.imageUrl);
        const blob = await res.blob();
        const desc = await faceDescriptorFromBlob(blob);
        if (!desc) continue;
        const d = euclidean(liveDesc, desc);
        if (d < bestDist) { bestDist = d; bestUserId = c.userId; }
      } catch {}
    }

    const THRESH = 0.6; // typical threshold
    const similarity = bestDist === Number.POSITIVE_INFINITY ? 0 : Math.max(0, 1 - bestDist);

    const shift = await getActiveShift();
    const matchedRec = (bestUserId !== 'NO_MATCH' && bestDist <= THRESH) ? await findEnrolledByUserId(bestUserId) : null;

    if (!matchedRec) {
      await logAttendance({ userRecord: null, result: 'NO_MATCH', similarity, kioskDeviceId: KIOSK_DEVICE_ID, image, shiftRecord: shift });
      return { ok: false, reason: 'NO_MATCH', similarity, image: '' };
    }

    // Determine check-in/out and lateness
    const now = new Date();
    const userShiftStart: string | undefined = (matchedRec as any).shiftStart;
    const userShiftEnd: string | undefined = (matchedRec as any).shiftEnd;
    const grace: number = Number((matchedRec as any).graceMinutes ?? 0);

    // Helper: build Date from today's date + HH:mm string
    const toTodayDate = (hhmm?: string): Date | undefined => {
      if (!hhmm) return undefined;
      const [h, m] = hhmm.split(':').map(Number);
      const d = new Date();
      d.setHours(h ?? 0, m ?? 0, 0, 0);
      return d;
    };

    const scheduledStart = toTodayDate(userShiftStart);
    const scheduledEnd = toTodayDate(userShiftEnd);

    // Decide IN/OUT based on existing logs for this user today and block after both done
    // - First SUCCESS of the day -> IN
    // - Next SUCCESS -> OUT
    // - If already >= 2 SUCCESS entries, do not log; return warning
    let checkType: 'IN' | 'OUT' = 'IN';
    try {
      const todays = await listLogsForUserOnDate((matchedRec as any).id, now);
      const successOnly = todays.filter(l => (l as any).result === 'SUCCESS');
      if (successOnly.length >= 2) {
        return { ok: false, reason: 'DAY_COMPLETED', image: '', similarity } as MarkAttendanceResponse;
      }
      checkType = successOnly.length % 2 === 0 ? 'IN' : 'OUT';
      // Minimum gap between successive marks (avoid immediate OUT after IN)
      const MIN_GAP_MS = 2 * 60 * 1000;
      if (successOnly.length > 0) {
        const last = successOnly[successOnly.length - 1] as any;
        const lastTime = new Date(last.created ?? last.eventTime ?? now).getTime();
        if (now.getTime() - lastTime < MIN_GAP_MS) {
          return { ok: false, reason: 'TOO_SOON', image: '', similarity } as MarkAttendanceResponse;
        }
      }
    } catch {}

    // Determine status
    let status: 'ON_TIME' | 'LATE' | 'EARLY' = 'ON_TIME';
    let lateMinutes = 0;
    if (checkType === 'IN' && scheduledStart) {
      const graceMs = grace * 60 * 1000;
      const latestOnTime = new Date(scheduledStart.getTime() + graceMs);
      if (now > latestOnTime) {
        status = 'LATE';
        lateMinutes = Math.round((now.getTime() - latestOnTime.getTime()) / 60000);
      }
    }
    if (checkType === 'OUT' && scheduledEnd && now < scheduledEnd) {
      status = 'EARLY';
    }

    await logAttendance({
      userRecord: matchedRec,
      result: 'SUCCESS',
      similarity,
      kioskDeviceId: KIOSK_DEVICE_ID,
      image,
      shiftRecord: shift,
      checkType,
      status,
      scheduledStart: scheduledStart?.toISOString(),
      scheduledEnd: scheduledEnd?.toISOString(),
      eventTime: now.toISOString(),
    });

    return {
      ok: true,
      user_id: bestUserId,
      name: (matchedRec as any).fullName,
      similarity,
      image: '',
      checkType,
      status,
      lateMinutes,
    };
  } catch (error) {
    console.error('Face recognition error:', error);
    throw { detail: 'Face recognition failed. Please try again.' } as ApiError;
  }
};
