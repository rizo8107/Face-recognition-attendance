import React, { useState, useEffect, useCallback } from 'react';
import WebcamCapture from './WebcamCapture';
import Button from './common/Button';
import Spinner from './common/Spinner';
import Alert from './common/Alert';
import UserCard from './UserCard';
import { enrollUser, getEnrolledUsersList, deleteUser } from '../services/apiService';
import type { EnrollmentResponse, ApiError, EnrolledUser } from '../types';

const EnrollmentView: React.FC = () => {
  const [userId, setUserId] = useState('');
  const [fullName, setFullName] = useState('');

  // Shift fields
  const [shiftStart, setShiftStart] = useState<string>('');
  const [shiftEnd, setShiftEnd] = useState<string>('');
  const [graceMinutes, setGraceMinutes] = useState<number>(10);

  const [capturedImage, setCapturedImage] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<EnrollmentResponse | null>(null);
  const [enrolledUsers, setEnrolledUsers] = useState<EnrolledUser[]>([]);

  const loadEnrolledUsers = useCallback(async () => {
    try {
      const users = await getEnrolledUsersList();
      setEnrolledUsers(users);
    } catch (e) {
      console.error('Failed to load enrolled users:', e);
      setError('Could not load the list of enrolled users.');
    }
  }, []);

  useEffect(() => {
    loadEnrolledUsers();
  }, [loadEnrolledUsers]);

  const resetForm = useCallback(() => {
    setUserId('');
    setFullName('');
    setShiftStart('');
    setShiftEnd('');
    setGraceMinutes(10);
    setCapturedImage(null);
    setError(null);
    setSuccess(null);
  }, []);

  const handleCapture = (blob: Blob) => {
    setCapturedImage(blob);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !fullName || !capturedImage) {
      setError('Please fill in all fields and capture an image.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await enrollUser({
        userId,
        fullName,
        image: capturedImage,
        shiftStart: shiftStart || undefined,
        shiftEnd: shiftEnd || undefined,
        graceMinutes: Number.isFinite(graceMinutes) ? graceMinutes : undefined,
      });
      setSuccess(response);
      loadEnrolledUsers();
    } catch (err) {
      setError((err as ApiError).detail || 'An unknown error occurred during enrollment.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm(`Are you sure you want to delete user with ID: ${id}? This action cannot be undone.`)) {
      try {
        await deleteUser(id);
        await loadEnrolledUsers();
      } catch (e) {
        console.error('Failed to delete user:', e);
        setError('An error occurred while trying to delete the user.');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Spinner />
        <p className="mt-3 text-base font-medium text-slate-600">Enrolling user…</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center">
        <Alert type="success" title="Enrollment Successful!">
          User <strong>{fullName}</strong> (ID: {success.user_id}) has been successfully enrolled.
        </Alert>
        <Button onClick={resetForm} className="mt-6">Enroll Another User</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row gap-8 mb-8">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-slate-800 mb-1">User & Shift</h2>
          <p className="text-slate-500 mb-4">Enter details and select a preset or times.</p>
          <form className="space-y-4">
            <div>
              <label htmlFor="userId" className="block text-sm font-medium text-slate-600 mb-1">User ID</label>
              <input
                id="userId"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g., EMP12345"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                disabled={!!capturedImage}
              />
            </div>
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-slate-600 mb-1">Full Name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Jane Doe"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                disabled={!!capturedImage}
              />
            </div>

            {/* Shift preset selector */}
            <div>
              <label htmlFor="shiftPreset" className="block text-sm font-medium text-slate-600 mb-1">Shift Preset</label>
              <select
                id="shiftPreset"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                disabled={!!capturedImage}
                onChange={(e) => {
                  const v = e.target.value; // "HH:mm|HH:mm"
                  if (!v) return;
                  const [s, e2] = v.split('|');
                  setShiftStart(s);
                  setShiftEnd(e2);
                }}
                defaultValue=""
              >
                <option value="" disabled>Select a preset</option>
                <option value="09:00|18:00">Morning 9:00 AM – 6:00 PM</option>
                <option value="10:00|19:00">10:00 AM – 7:00 PM</option>
                <option value="11:00|20:00">11:00 AM – 8:00 PM</option>
                <option value="08:30|17:30">8:30 AM – 5:30 PM</option>
                <option value="11:30|20:30">11:30 AM – 8:30 PM</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Selecting a preset auto-fills the time fields. You can still adjust them.
              </p>
            </div>

            {/* Manual shift fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="shiftStart" className="block text-sm font-medium text-slate-600 mb-1">Shift Start</label>
                <input
                  id="shiftStart"
                  type="time"
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  disabled={!!capturedImage}
                />
              </div>
              <div>
                <label htmlFor="shiftEnd" className="block text-sm font-medium text-slate-600 mb-1">Shift End</label>
                <input
                  id="shiftEnd"
                  type="time"
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  disabled={!!capturedImage}
                />
              </div>
              <div>
                <label htmlFor="graceMinutes" className="block text-sm font-medium text-slate-600 mb-1">Grace (mins)</label>
                <input
                  id="graceMinutes"
                  type="number"
                  min={0}
                  value={graceMinutes}
                  onChange={(e) => setGraceMinutes(Number(e.target.value))}
                  placeholder="e.g., 10"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  disabled={!!capturedImage}
                />
              </div>
            </div>
          </form>
        </div>

        <div className="flex-1">
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Capture Photo</h2>
          <p className="text-slate-500 mb-4">Capture a clear, forward‑facing photo.</p>
          <WebcamCapture onCapture={handleCapture} onReset={resetForm} captureButtonText="Capture Photo" />
        </div>
      </div>

      {error && <Alert type="error" title="Operation failed">{error}</Alert>}

      <div className="mt-6 text-center">
        <Button onClick={handleSubmit} disabled={!capturedImage || !userId || !fullName} className="w-full max-w-md">
          Complete Enrollment
        </Button>
      </div>

      <div className="mt-16">
        <div className="border-b border-slate-200 pb-2 mb-6">
          <h2 className="text-2xl font-bold text-slate-800">Enrolled Users ({enrolledUsers.length})</h2>
        </div>
        {enrolledUsers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {enrolledUsers.map(user => (
              <UserCard key={user.userId} user={user} onDelete={handleDeleteUser} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
            <p className="text-slate-500">No users have been enrolled yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnrollmentView;