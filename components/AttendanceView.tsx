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
  const [autoDetect, setAutoDetect] = useState<boolean>(false);

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

    try {
      const response = await markAttendance(blob);
      setResult(response);
    } catch (err) {
      setError((err as ApiError).detail || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCaptureMode) {
    return (
      <div className="flex flex-col items-center">
        <h2 className="text-2xl font-bold text-cyan-400 mb-2">Mark Attendance</h2>
        <p className="text-gray-400 mb-4 text-center">Position your face in the frame and {autoDetect ? 'hold still for auto-detect' : 'capture an image'} to sign in.</p>
        <label className="flex items-center gap-2 mb-4 select-none">
          <input type="checkbox" checked={autoDetect} onChange={(e) => setAutoDetect(e.target.checked)} />
          <span className="text-sm text-gray-300">Auto detect when face is stable</span>
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
          <p className="mt-4 text-lg font-semibold text-cyan-300">Verifying Identity... Please wait.</p>
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
        <div className="w-full max-w-md text-center">
          <div className="bg-gray-700/50 border border-green-500 rounded-lg p-8 shadow-lg">
              <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-white">Welcome, {result.name}!</h2>
              <p className="text-green-300 mt-1 mb-6 text-lg">Attendance Marked Successfully</p>
              <div className="text-left space-y-3 text-gray-300">
                  <p className="flex items-center"><UserCircleIcon className="w-5 h-5 mr-3 text-cyan-400"/><strong>User Name:</strong><span className="ml-auto font-mono">{result.name}</span></p>
                  <p className="flex items-center"><HashtagIcon className="w-5 h-5 mr-3 text-cyan-400"/><strong>User ID:</strong><span className="ml-auto font-mono">{result.user_id}</span></p>
                  <p className="flex items-center"><ScanIcon className="w-5 h-5 mr-3 text-cyan-400"/><strong>Similarity Score:</strong><span className="ml-auto font-mono">{(result.similarity * 100).toFixed(2)}%</span></p>
                  {result.checkType && (
                    <p className="flex items-center"><ScanIcon className="w-5 h-5 mr-3 text-cyan-400"/><strong>Check:</strong><span className="ml-auto font-mono">{result.checkType}</span></p>
                  )}
                  {result.status && (
                    <p className="flex items-center">
                      <ScanIcon className="w-5 h-5 mr-3 text-cyan-400"/>
                      <strong>Status:</strong>
                      <span className={`ml-auto font-mono ${result.status === 'LATE' ? 'text-red-400' : 'text-green-300'}`}>
                        {result.status}
                        {result.status === 'LATE' && result.lateMinutes !== undefined ? ` (${result.lateMinutes} min)` : ''}
                      </span>
                    </p>
                  )}
              </div>
          </div>
          <Button onClick={reset} className="mt-8">Mark Another</Button>
        </div>
      )}
      
      {result && !result.ok && (
        <div className="w-full max-w-md text-center">
          <div className="bg-gray-700/50 border border-red-500 rounded-lg p-8 shadow-lg">
              <XCircleIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-white">Verification Failed</h2>
              <p className="text-red-300 mt-1 mb-6 text-lg">
                {result.reason === 'NO_MATCH' ? 'No matching user found.' : 'Could not detect a clear face.'}
              </p>
              {result.similarity !== undefined && (
                 <p className="flex items-center justify-center"><ScanIcon className="w-5 h-5 mr-3 text-cyan-400"/><strong>Similarity Score:</strong><span className="ml-4 font-mono">{(result.similarity * 100).toFixed(2)}%</span></p>
              )}
          </div>
          <Button onClick={reset} className="mt-8">Mark Another</Button>
        </div>
      )}
    </div>
  );
};

export default AttendanceView;