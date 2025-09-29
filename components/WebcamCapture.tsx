
import React, { useState, useEffect, useCallback } from 'react';
import { useWebcam } from '../hooks/useWebcam';
import Button from './common/Button';
import { CameraIcon, RefreshIcon, CheckCircleIcon, PowerIcon } from './common/Icons';
import { blobToSigVector, cosineSim } from '../services/sigService';
import { isCapacitorAndroid, captureViaNativeCamera } from '../services/nativeCamera';

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
  const isNative = isCapacitorAndroid();

  useEffect(() => {
    if (isNative) {
      // Optionally auto-open camera when autoDetect is enabled
      (async () => {
        if (autoDetect && !capturedBlob) {
          const b = await captureViaNativeCamera();
          if (b) {
            setCapturedBlob(b);
            setCapturedImage(URL.createObjectURL(b));
          }
        }
      })();
      return;
    }
    startWebcam();
    return () => { stopWebcam(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = async () => {
    const blob = isNative ? await captureViaNativeCamera() : await captureFrame();
    if (blob) {
      setCapturedBlob(blob);
      setCapturedImage(URL.createObjectURL(blob));
      if (!isNative) stopWebcam();
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
    if (isNative) return; // skip stability loop on native path
    if (!autoDetect || capturedImage) return;
    let cancelled = false;
    let prevSig: Float32Array | null = null;
    let stableCount = 0;
    let lastAutoAt = 0;
    let prevPresence = false;
    let entering = false;

    const STABLE_SIM = 0.998;        // stricter stability for robustness
    const FAST_SIM = 0.999;          // very high similarity -> fast path
    const MOVE_SIM = 0.985;          // movement threshold (lower means more change)
    const VAR_MIN = 0.001;           // min variance to consider a face/background with contrast
    const STABLE_FRAMES = 4;         // robust stabilization frames
    const ENTER_STABLE_FRAMES = 1;   // fast path right after entering
    const INTERVAL_MS = 500;         // check a bit faster
    const COOLDOWN_MS = 2500;        // cooldown after auto-capture

    const tick = async () => {
      if (cancelled) return;
      try {
        const now = Date.now();
        if (now - lastAutoAt < COOLDOWN_MS) {
          return setTimeout(tick, INTERVAL_MS);
        }
        const blob = await captureFrame();
        if (!blob) return setTimeout(tick, INTERVAL_MS);
        const sig = await blobToSigVector(blob);
        // derive a light-weight contrast metric from normalized vector
        let sum = 0;
        for (let i = 0; i < sig.length; i++) sum += sig[i];
        const mean = sum / sig.length;
        const variance = (1 / sig.length) - (mean * mean); // since ||sig||=1
        const hasPresence = variance >= VAR_MIN;
        if (!hasPresence) {
          // very flat / low-contrast frame, skip
          stableCount = 0;
          prevSig = sig;
          prevPresence = false;
          entering = false;
          return setTimeout(tick, INTERVAL_MS);
        }
        // detect entering: transition from no presence to presence
        if (hasPresence && !prevPresence) {
          entering = true;
          stableCount = 0;
        }

        let sim = 0;
        if (prevSig) sim = cosineSim(prevSig, sig);
        // movement resets count
        if (prevSig && sim < MOVE_SIM) {
          stableCount = 0;
        } else if (prevSig && sim > STABLE_SIM) {
          stableCount += 1;
        } else {
          stableCount = 0;
        }
        prevSig = sig;
        // Adaptive: very high similarity allows immediate capture when presence just entered
        const needed = entering ? ENTER_STABLE_FRAMES : STABLE_FRAMES;
        if ((entering && sim >= FAST_SIM) || stableCount >= needed) {
          lastAutoAt = now;
          stopWebcam();
          onCapture(blob);
          return;
        }
        prevPresence = hasPresence;
      } catch {}
      setTimeout(tick, INTERVAL_MS);
    };

    const id = setTimeout(tick, 500);
    return () => { cancelled = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetect, capturedImage, isNative]);

  const videoContainerClasses = "relative w-full aspect-[4/3] bg-white rounded-xl overflow-hidden shadow-sm border border-slate-300 flex items-center justify-center";
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
        ) : isNative ? (
          <div className="flex flex-col items-center justify-center w-full h-full text-slate-600">
            <p className="text-sm">Tap capture to open camera</p>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className={videoClasses} />
        )}
        {!isNative && !stream && !capturedImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/70">
                <p className="text-sm font-medium text-slate-600">Starting camera…</p>
            </div>
        )}
      </div>

      <div className="flex w-full justify-center gap-3 max-sm:flex-col">
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
