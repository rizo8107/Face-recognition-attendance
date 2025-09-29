
import { GoogleGenAI, Type } from "@google/genai";
import type { EnrollmentData, EnrollmentResponse, MarkAttendanceResponse, ApiError, EnrolledUser } from '../types';
import { listEnrolledUsers as pbListEnrolled, createEnrolledUser, deleteEnrolledUserById, getActiveShift, logAttendance, findEnrolledByUserId, listLogsForUserOnDate } from './backendService';
import { shortlistByBlob } from './candidateIndex';
import { getPb } from './pbClient';
import { KIOSK_DEVICE_ID } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

export const markAttendance = async (image: Blob): Promise<MarkAttendanceResponse> => {
  const users = await pbListEnrolled();
  if (users.length === 0) {
    // Log NO_MATCH with shift
    const shift = await getActiveShift();
    await logAttendance({ userRecord: null, result: 'NO_MATCH', kioskDeviceId: KIOSK_DEVICE_ID, image, shiftRecord: shift });
    return { ok: false, reason: 'NO_MATCH', image: '' };
  }

  const capturedImageBase64 = await blobToBase64(image);
  // Shortlist top-K candidates by lightweight signature
  const candidates = await shortlistByBlob(image, 5);
  const userIds: string[] = [];
  const parts: any[] = [{ inlineData: { mimeType: 'image/jpeg', data: capturedImageBase64 } }];
  for (const c of candidates) {
    try {
      const b64 = await fetchUrlToBase64(c.imageUrl);
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
      userIds.push(c.userId);
    } catch {}
  }

  if (userIds.length === 0) {
    const shift = await getActiveShift();
    await logAttendance({ userRecord: null, result: 'NO_MATCH', kioskDeviceId: KIOSK_DEVICE_ID, image, shiftRecord: shift });
    return { ok: false, reason: 'NO_MATCH', image: '' };
  }

  const prompt = `You are a facial recognition system.\nThe first image provided is a live capture of a person trying to sign in.\nThe subsequent images are of enrolled users.\nCompare the live capture to each enrolled user's image.\nIdentify the enrolled user with the highest facial similarity to the live capture.\nRespond ONLY with a JSON object that matches the provided schema.\nThe JSON object must contain the 'userId' of the best match and a 'similarity' score between 0.0 and 1.0.\nIf no enrolled user is a confident match (similarity below 0.5), return 'NO_MATCH' as the userId.\nThe user IDs are, in order: ${userIds.join(', ')}.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }, ...parts] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            userId: { type: Type.STRING },
            similarity: { type: Type.NUMBER },
          },
          required: ['userId', 'similarity'],
        },
      },
    });

    const resultJson = JSON.parse(response.text);
    const { userId, similarity } = resultJson as { userId: string; similarity: number };

    const shift = await getActiveShift();
    const matchedRec = userId && userId !== 'NO_MATCH' ? await findEnrolledByUserId(userId) : null;

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

    // Decide IN/OUT based on existing logs for this user today:
    // - First SUCCESS of the day -> IN
    // - Next SUCCESS -> OUT
    let checkType: 'IN' | 'OUT' = 'IN';
    try {
      const todays = await listLogsForUserOnDate((matchedRec as any).id, now);
      const successCount = todays.filter(l => (l as any).result === 'SUCCESS').length;
      checkType = successCount % 2 === 0 ? 'IN' : 'OUT';
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
      user_id: userId,
      name: (matchedRec as any).fullName,
      similarity,
      image: '',
      checkType,
      status,
      lateMinutes,
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw { detail: 'Face verification service failed. Please try again.' } as ApiError;
  }
};
