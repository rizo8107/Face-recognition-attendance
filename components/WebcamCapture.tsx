
import React, { useState, useEffect, useCallback } from 'react';
import { useWebcam } from '../hooks/useWebcam';
import Button from './common/Button';
import { CameraIcon, RefreshIcon, CheckCircleIcon, PowerIcon } from './common/Icons';
import { blobToSigVector, cosineSim } from '../services/sigService';

interface WebcamCaptureProps {
  onCapture: (blob: Blob) => void;
  onReset: () => void;
  captureButtonText: string;
  autoDetect?: boolean;
}

const WebcamCapture: React.FC<WebcamCaptureProps> = ({ onCapture, onReset, captureButtonText, autoDetect }) => {
  const { videoRef, stream, error, startWebcam, stopWebcam, captureFrame } = useWebcam();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  useEffect(() => {
    startWebcam();
    return () => {
      stopWebcam();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = async () => {
    const blob = await captureFrame();
    if (blob) {
      setCapturedBlob(blob);
      setCapturedImage(URL.createObjectURL(blob));
      stopWebcam();
    }
  };

  const handleRetake = () => {
    URL.revokeObjectURL(capturedImage!);
    setCapturedImage(null);
    setCapturedBlob(null);
    onReset();
    startWebcam();
  };

  const handleConfirm = () => {
    if (capturedBlob) {
      onCapture(capturedBlob);
    }
  };

  // Auto-detect loop: capture frames, compare stability via cosine similarity of tiny signatures
  useEffect(() => {
    if (!autoDetect || capturedImage) return;
    let cancelled = false;
    let prevSig: Float32Array | null = null;
    let stableCount = 0;

    const tick = async () => {
      if (cancelled) return;
      try {
        const blob = await captureFrame();
        if (!blob) return setTimeout(tick, 800);
        const sig = await blobToSigVector(blob);
        let sim = 0;
        if (prevSig) sim = cosineSim(prevSig, sig);
        if (prevSig && sim > 0.995) {
          stableCount += 1;
        } else {
          stableCount = 0;
        }
        prevSig = sig;
        if (stableCount >= 2) {
          // Consider face stable; auto trigger capture
          stopWebcam();
          onCapture(blob);
          return;
        }
      } catch {}
      setTimeout(tick, 800);
    };

    const id = setTimeout(tick, 600);
    return () => { cancelled = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetect, capturedImage]);

  const videoContainerClasses = "relative w-full aspect-[4/3] bg-gray-900 rounded-lg overflow-hidden shadow-lg border-2 border-gray-700 flex items-center justify-center";
  const videoClasses = "w-full h-full object-cover";

  if (error) {
    return (
      <div className={`${videoContainerClasses} flex-col p-4 text-center`}>
        <p className="text-red-400 font-semibold">{error}</p>
        <Button onClick={startWebcam} className="mt-4" variant="secondary">
          <RefreshIcon className="w-5 h-5 mr-2" />
          Retry Access
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto">
      <div className={videoContainerClasses}>
        {capturedImage ? (
          <img src={capturedImage} alt="Captured frame" className={videoClasses} />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className={videoClasses} />
        )}
        {!stream && !capturedImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50">
                <p className="text-lg font-medium text-gray-300">Starting camera...</p>
            </div>
        )}
      </div>

      <div className="flex w-full justify-center gap-4">
        {capturedImage ? (
          <>
            <Button onClick={handleRetake} variant="secondary" className="flex-1">
              <RefreshIcon className="w-5 h-5 mr-2" />
              Retake
            </Button>
            <Button onClick={handleConfirm} variant="primary" className="flex-1">
              <CheckCircleIcon className="w-5 h-5 mr-2" />
              Confirm
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleCapture} disabled={!stream} variant="primary" className="flex-1">
              <CameraIcon className="w-5 h-5 mr-2" />
              {captureButtonText}
            </Button>
             <Button onClick={stopWebcam} disabled={!stream} variant="danger" title="Stop Camera">
                <PowerIcon className="w-5 h-5"/>
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default WebcamCapture;
