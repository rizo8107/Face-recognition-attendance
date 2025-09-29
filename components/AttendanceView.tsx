import React, { useState } from 'react';
import WebcamCapture from './WebcamCapture';
import Spinner from './common/Spinner';
import Alert from './common/Alert';
import { markAttendance } from '../services/apiService';
import type { MarkAttendanceResponse, ApiError } from '../types';
import Button from './common/Button';
import { CheckCircleIcon, XCircleIcon, UserCircleIcon, HashtagIcon, ScanIcon } from './common/Icons';

const AttendanceView: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MarkAttendanceResponse | null>(null);
  const [isCaptureMode, setIsCaptureMode] = useState(true);
  const [autoDetect, setAutoDetect] = useState<boolean>(true);
  const [showAnim, setShowAnim] = useState<boolean>(true);

  const reset = () => {
    setIsLoading(false);
    setError(null);
    setResult(null);
    setIsCaptureMode(true);
  };

  const handleCapture = async (blob: Blob) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setIsCaptureMode(false);
    setShowAnim(false);

    try {
      const response = await markAttendance(blob);
      setResult(response);
      // trigger fade-in on result card
      requestAnimationFrame(() => setShowAnim(true));
    } catch (err) {
      setError((err as ApiError).detail || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCaptureMode) {
    return (
      <div className={`flex flex-col items-center transition-opacity duration-300 ${showAnim ? 'opacity-100' : 'opacity-0'}`}>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Mark Attendance</h2>
        <p className="text-slate-500 mb-3 text-center">{autoDetect ? 'Hold still to auto‑capture' : 'Tap capture when ready'}</p>
        <label className="flex items-center gap-2 mb-4 select-none text-slate-700">
          <input type="checkbox" checked={autoDetect} onChange={(e) => setAutoDetect(e.target.checked)} />
          <span className="text-sm">Auto detect</span>
        </label>
        <WebcamCapture 
          onCapture={handleCapture} 
          onReset={reset}
          captureButtonText="Mark Attendance" 
          autoDetect={autoDetect}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-4 min-h-[480px]">
      {isLoading && (
        <div className="flex flex-col items-center text-center">
          <Spinner />
          <p className="mt-3 text-base font-medium text-slate-600">Verifying identity…</p>
        </div>
      )}
      
      {error && (
         <div className="w-full max-w-md text-center">
            <Alert type="error" title="Verification Failed">{error}</Alert>
            <Button onClick={reset} className="mt-6">Try Again</Button>
         </div>
      )}
{/* FIX: Restructured the conditional rendering to help TypeScript correctly narrow the `result` type. */}
      {result && result.ok && (
        <div className={`w-full max-w-md text-center transition-all duration-300 ease-out ${showAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <CheckCircleIcon className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-slate-900">Welcome, {result.name}!</h2>
              <p className="text-emerald-600 mt-1 mb-5">Attendance marked</p>
              <div className="text-left space-y-2 text-slate-700">
                  <p className="flex items-center"><UserCircleIcon className="w-5 h-5 mr-3 text-sky-500"/><span className="text-slate-500 mr-2">Name</span><span className="ml-auto font-mono">{result.name}</span></p>
                  <p className="flex items-center"><HashtagIcon className="w-5 h-5 mr-3 text-sky-500"/><span className="text-slate-500 mr-2">ID</span><span className="ml-auto font-mono">{result.user_id}</span></p>
                  <p className="flex items-center"><ScanIcon className="w-5 h-5 mr-3 text-sky-500"/><span className="text-slate-500 mr-2">Similarity</span><span className="ml-auto font-mono">{(result.similarity * 100).toFixed(2)}%</span></p>
                  {result.checkType && (
                    <p className="flex items-center"><ScanIcon className="w-5 h-5 mr-3 text-sky-500"/><span className="text-slate-500 mr-2">Check</span><span className="ml-auto font-mono">{result.checkType}</span></p>
                  )}
                  {result.status && (
                    <p className="flex items-center">
                      <ScanIcon className="w-5 h-5 mr-3 text-sky-500"/>
                      <span className="text-slate-500 mr-2">Status</span>
                      <span className={`ml-auto font-mono ${result.status === 'LATE' ? 'text-rose-500' : 'text-emerald-600'}`}>
                        {result.status}
                        {result.status === 'LATE' && result.lateMinutes !== undefined ? ` (${result.lateMinutes} min)` : ''}
                      </span>
                    </p>
                  )}
              </div>
          </div>
          <Button onClick={reset} className="mt-6">Mark Another</Button>
        </div>
      )}
      
      {result && !result.ok && (
        <div className={`w-full max-w-md text-center transition-all duration-300 ease-out ${showAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          <div className="bg-white border border-rose-200 rounded-xl p-6 shadow-sm">
              <XCircleIcon className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-slate-900">Verification failed</h2>
              <p className="text-rose-600 mt-1 mb-4 text-sm">
                {result.reason === 'NO_MATCH' ? 'No matching user found.' : 'Face not clear. Try again.'}
              </p>
              {result.similarity !== undefined && (
                 <p className="flex items-center justify-center text-slate-700"><ScanIcon className="w-5 h-5 mr-2 text-sky-500"/><span className="text-slate-500 mr-2">Similarity</span><span className="font-mono">{(result.similarity * 100).toFixed(2)}%</span></p>
              )}
          </div>
          <Button onClick={reset} className="mt-6">Try Again</Button>
        </div>
      )}
    </div>
  );
};

export default AttendanceView;