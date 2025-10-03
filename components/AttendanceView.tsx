import React, { useState, useEffect } from 'react';
import WebcamCapture from './WebcamCapture';
import BasicCamera from './BasicCamera';
import UltraFastCamera from './UltraFastCamera';
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
  const [continuous, setContinuous] = useState<boolean>(false);
  const [showAnim, setShowAnim] = useState<boolean>(true);
  
  // Camera modes: 
  // - fast: BasicCamera with minimal processing
  // - ultra: UltraFastCamera using browser's native file picker (fastest)
  // - advanced: WebcamCapture with face detection (slowest)
  const [cameraMode, setCameraMode] = useState<'ultra' | 'fast' | 'advanced'>('ultra'); // Ultra-fast by default

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
      // Auto reset in continuous mode
      if (continuous) {
        setTimeout(() => {
          reset();
          setShowAnim(true);
        }, 2500);
      }
    }
  };

  if (isCaptureMode) {
    return (
      <div className={`flex flex-col items-center transition-opacity duration-300 ${showAnim ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-[#0A3172] text-white w-full py-4 px-6 rounded-t-2xl shadow-md mb-5">
          <h2 className="text-2xl font-bold">Mark Attendance</h2>
          <p className="text-blue-100 text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        
        <div className="bg-gray-50 rounded-2xl shadow-lg p-6 w-full max-w-md mb-5">
          <p className="text-[#0A3172] font-medium mb-3 text-center">
            {cameraMode === 'ultra' ? 
              'Lightning mode: Native device camera' : 
              cameraMode === 'fast' ? 
              'Performance mode: Simple camera' : 
              autoDetect ? 'Hold still to auto‑capture' : 'Tap capture when ready'
            }
          </p>
          
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4 border border-gray-100">
            <div className="flex flex-col gap-2 mb-3">
              <p className="text-sm font-medium text-gray-700">Camera Mode:</p>
              
              <div className="flex items-center gap-2 mb-1">
                <button 
                  onClick={() => setCameraMode('ultra')} 
                  className={`px-3 py-1 text-sm font-medium rounded-lg ${cameraMode === 'ultra' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Lightning Fast
                </button>
                
                <button 
                  onClick={() => setCameraMode('fast')} 
                  className={`px-3 py-1 text-sm font-medium rounded-lg ${cameraMode === 'fast' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Fast
                </button>
                
                <button 
                  onClick={() => setCameraMode('advanced')} 
                  className={`px-3 py-1 text-sm font-medium rounded-lg ${cameraMode === 'advanced' ? 'bg-[#0A3172] text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Advanced
                </button>
              </div>
              
              <p className="text-xs text-gray-500">
                {cameraMode === 'ultra' ? 'Uses mobile device camera (fastest)' : 
                 cameraMode === 'fast' ? 'Simplified camera with no face detection' : 
                 'Full face detection and recognition'}
              </p>
            </div>
            
            {cameraMode === 'advanced' && (
              <>
                <label className="flex items-center justify-between gap-2 mb-3 select-none">
                  <span className="text-sm font-medium text-gray-700">Auto detect</span>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none">
                    <input type="checkbox" checked={autoDetect} onChange={(e) => setAutoDetect(e.target.checked)} 
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-transform duration-200 ease-in" />
                    <label className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${autoDetect ? 'bg-[#0A3172]' : 'bg-gray-300'}`}></label>
                  </div>
                </label>
              </>
            )}
            
            <label className="flex items-center justify-between gap-2 select-none">
              <span className="text-sm font-medium text-gray-700">Continuous mode</span>
              <div className="relative inline-block w-10 mr-2 align-middle select-none">
                <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} 
                  className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-transform duration-200 ease-in" />
                <label className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${continuous ? 'bg-[#0A3172]' : 'bg-gray-300'}`}></label>
              </div>
            </label>
          </div>
        </div>
        {cameraMode === 'ultra' ? (
          <UltraFastCamera 
            onCapture={handleCapture}
            buttonText="Mark Attendance"
          />
        ) : cameraMode === 'fast' ? (
          <BasicCamera 
            onCapture={handleCapture}
            buttonText="Mark Attendance"
          />
        ) : (
          <WebcamCapture 
            onCapture={handleCapture} 
            onReset={reset}
            captureButtonText="Mark Attendance"
            autoDetect={autoDetect}
          />
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center p-4 min-h-[480px] bg-gray-50">
      {isLoading && (
        <div className="flex flex-col items-center text-center bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
          <div className="w-16 h-16 border-4 border-t-[#0A3172] border-r-[#0A3172] border-b-[#0A3172]/30 border-l-[#0A3172]/30 rounded-full animate-spin"></div>
          <p className="mt-5 text-base font-medium text-[#0A3172]">Verifying identity…</p>
        </div>
      )}

      {error && (
        <div className="w-full max-w-md text-center">
          <div className="bg-white border border-red-100 rounded-2xl shadow-lg overflow-hidden">
            <div className="bg-red-50 p-5 border-b border-red-100">
              <XCircleIcon className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <h2 className="text-xl font-bold text-red-700">Verification Failed</h2>
            </div>
            <div className="p-6">
              <p className="text-slate-700">{error}</p>
            </div>
          </div>
          <Button onClick={reset} className="mt-6 bg-[#0A3172] hover:bg-[#072658] text-white font-medium py-2 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Try Again</Button>
        </div>
      )}

      {result && result.ok && (
        <div className={`w-full max-w-md text-center transition-all duration-300 ease-out ${showAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Header with navy background */}
            <div className="bg-[#0A3172] p-6 text-white text-center relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-teal-400"></div>
              <div className="bg-white rounded-full p-2 inline-block mb-2">
                <CheckCircleIcon className="w-8 h-8 text-[#0A3172]" />
              </div>
              
              {/* Personalized greeting based on check type */}
              <h2 className="text-xl font-bold">
                {result.checkType === 'IN' ? 
                  `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${result.name}!` : 
                  `Goodbye, ${result.name}!`
                }
              </h2>
              
              {/* Custom attendance message */}
              <p className="text-blue-100 text-sm mt-1">
                {result.checkType === 'IN' ? 
                  'Your check-in was successful.' : 
                  'Your check-out was recorded successfully.'
                }
              </p>
            </div>
            
            {/* Body content */}
            <div className="p-6">
              {/* Sendoff message */}
              <div className="bg-blue-50 rounded-lg p-4 mb-6 text-left border-l-4 border-[#0A3172]">
                <p className="text-[#0A3172] text-sm">
                  {result.checkType === 'IN' ? 
                    'Have a productive day ahead!' : 
                    'Thank you for your work today. Have a great time!'
                  }
                </p>
              </div>
              
              {/* Details section */}
              <div className="bg-gray-50 rounded-xl p-4 text-left">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Attendance Details</h3>
                <div className="divide-y divide-gray-200">
                  <div className="flex items-center py-2">
                    <UserCircleIcon className="w-5 h-5 text-[#0A3172]" />
                    <span className="text-gray-600 ml-3">Name</span>
                    <span className="ml-auto text-gray-900 font-medium">{result.name}</span>
                  </div>
                  
                  <div className="flex items-center py-2">
                    <HashtagIcon className="w-5 h-5 text-[#0A3172]" />
                    <span className="text-gray-600 ml-3">ID</span>
                    <span className="ml-auto text-gray-900 font-medium">{result.user_id}</span>
                  </div>
                  
                  <div className="flex items-center py-2">
                    <ScanIcon className="w-5 h-5 text-[#0A3172]" />
                    <span className="text-gray-600 ml-3">Similarity</span>
                    <span className="ml-auto bg-gray-100 text-gray-900 font-medium px-2 py-1 rounded">{(result.similarity * 100).toFixed(2)}%</span>
                  </div>
                  
                  {result.checkType && (
                    <div className="flex items-center py-2">
                      <ScanIcon className="w-5 h-5 text-[#0A3172]" />
                      <span className="text-gray-600 ml-3">Check</span>
                      <span className="ml-auto bg-blue-100 text-[#0A3172] font-medium px-2 py-1 rounded">{result.checkType}</span>
                    </div>
                  )}
                  
                  {result.status && (
                    <div className="flex items-center py-2">
                      <ScanIcon className="w-5 h-5 text-[#0A3172]" />
                      <span className="text-gray-600 ml-3">Status</span>
                      <span className={`ml-auto ${result.status === 'LATE' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} font-medium px-2 py-1 rounded`}>
                        {result.status}
                        {result.status === 'LATE' && result.lateMinutes !== undefined ? ` (${result.lateMinutes} min)` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <Button onClick={reset} className="mt-6 bg-[#0A3172] hover:bg-[#072658] text-white font-medium py-3 px-8 rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Mark Another</Button>
        </div>
      )}

      {result && !result.ok && (
        <div className={`w-full max-w-md text-center transition-all duration-300 ease-out ${showAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Header with appropriate color based on reason */}
            <div className={`p-6 text-white text-center relative ${result.reason === 'DAY_COMPLETED' ? 'bg-orange-500' : result.reason === 'TOO_SOON' ? 'bg-amber-500' : 'bg-[#0A3172]'}`}>
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-teal-400"></div>
              <div className="bg-white rounded-full p-2 inline-block mb-2">
                <XCircleIcon className={`w-8 h-8 ${result.reason === 'DAY_COMPLETED' ? 'text-orange-500' : result.reason === 'TOO_SOON' ? 'text-amber-500' : 'text-[#0A3172]'}`} />
              </div>
              
              {/* Friendly title based on the reason */}
              <h2 className="text-xl font-bold">
                {result.reason === 'DAY_COMPLETED' ? 'Already Completed Today' : 
                 result.reason === 'NO_MATCH' ? 'Hello There!' : 
                 result.reason === 'TOO_SOON' ? 'Just a Moment...' : 
                 'Verification Needed'}
              </h2>
            </div>
            
            {/* Body content */}
            <div className="p-6">
              {/* Message card */}
              <div className={`rounded-lg p-4 mb-4 text-left border-l-4 ${result.reason === 'DAY_COMPLETED' ? 'bg-orange-50 border-orange-500' : result.reason === 'TOO_SOON' ? 'bg-amber-50 border-amber-500' : 'bg-blue-50 border-[#0A3172]'}`}>
                {/* Detailed friendly explanation */}
                <p className={`font-medium ${result.reason === 'DAY_COMPLETED' ? 'text-orange-700' : result.reason === 'TOO_SOON' ? 'text-amber-700' : 'text-[#0A3172]'}`}>
                  {result.reason === 'DAY_COMPLETED' && "You've already checked in and out today."}
                  {result.reason === 'NO_MATCH' && "We couldn't find your profile in our system."}
                  {result.reason === 'NO_FACE' && "We couldn't detect a face clearly in the image."}
                  {result.reason === 'MULTIPLE_FACES' && "We detected multiple people in the frame."}
                  {result.reason === 'TOO_SOON' && "You recently checked in/out. Please wait a moment."}
                </p>
              </div>
              
              {/* Helpful guidance message */}
              <div className="bg-gray-50 rounded-lg p-4 text-gray-600 text-sm mb-4">
                <p>
                  {result.reason === 'DAY_COMPLETED' && "Please come back tomorrow for your next shift. Have a great day!"}
                  {result.reason === 'NO_MATCH' && "Please ensure you're enrolled in the system or try repositioning your face."}
                  {result.reason === 'NO_FACE' && "Please center yourself in the frame and ensure good lighting."}
                  {result.reason === 'MULTIPLE_FACES' && "Please ensure only one person is in the frame at a time."}
                  {result.reason === 'TOO_SOON' && "There's a brief waiting period between check-ins and check-outs."}
                </p>
              </div>
              
              {/* Show similarity if available */}
              {result.reason !== 'DAY_COMPLETED' && result.similarity !== undefined && (
                <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <ScanIcon className="w-5 h-5 text-[#0A3172]" />
                    <span className="text-gray-600 text-sm ml-2">Similarity Score</span>
                  </div>
                  <span className="bg-gray-100 text-gray-900 text-sm font-medium px-3 py-1 rounded">{(result.similarity * 100).toFixed(2)}%</span>
                </div>
              )}
            </div>
          </div>
          <Button onClick={reset} className="mt-6 bg-[#0A3172] hover:bg-[#072658] text-white font-medium py-3 px-8 rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Try Again</Button>
        </div>
      )}
    </div>
  );
};

export default AttendanceView;