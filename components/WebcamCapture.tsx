
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWebcam } from '../hooks/useWebcam';
import Button from './common/Button';
import { CameraIcon, RefreshIcon, CheckCircleIcon, PowerIcon } from './common/Icons';
import { blobToSigVector, cosineSim } from '../services/sigService';
import { isCapacitorAndroid, captureViaNativeCamera } from '../services/nativeCamera';
import { ensureFaceModels } from '../services/faceModels';
import { faceDescriptorFromBlob, euclidean } from '../services/faceEmbed';
import { buildCandidateIndex, ensureDescriptorsForAll, getCandidatesCache, ensureSigsForAll } from '../services/candidateIndex';

interface WebcamCaptureProps {
  onCapture: (blob: Blob, hintUserId?: string) => void;
  onReset: () => void;
  captureButtonText: string;
  autoDetect?: boolean;
}

const WebcamCapture: React.FC<WebcamCaptureProps> = ({ onCapture, onReset, captureButtonText, autoDetect }) => {
  const { videoRef, stream, error, startWebcam, stopWebcam, captureFrame } = useWebcam();
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [pending, setPending] = useState<{ name: string; userId?: string; blob: Blob } | null>(null);
  const [countdown, setCountdown] = useState<number>(4);
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

  // When a pending match exists, start a 4s countdown and auto-confirm
  useEffect(() => {
    if (!pending) return;
    setCountdown(10);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          // auto confirm
          onCapture(pending.blob, pending.userId);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [pending, onCapture]);

  const handleConfirmPending = () => {
    if (pending) onCapture(pending.blob, pending.userId);
  };

  const handleCancelPending = () => {
    setPending(null);
    // resume scanning by restarting webcam if it was stopped
    if (!stream && !isNative) startWebcam();
  };
  
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
    if (pending) return; // pause while confirmation dialog is visible
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
        prevPresence = hasPresence;
      } catch {}
      setTimeout(tick, INTERVAL_MS);
    };

    const id = setTimeout(tick, 500);
    return () => { cancelled = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetect, capturedImage, isNative, pending]);
  
  // Real-time face detection overlay + auto-mark using face-api (without freezing the frame)
  useEffect(() => {
    if (isNative) return; // native uses tap-to-capture flow
    if (!autoDetect || capturedImage) return; // only when scanning
    if (pending) return; // pause overlay while waiting for confirmation
    let cancelled = false;
    let ready = false;
    let raf = 0;
    let lastRun = 0;
    let detectRunning = false; // prevent concurrent detections
    let stable = 0;
    const THRESH = 0.75; // very relaxed threshold for beards (higher = easier)
    const NEED = 1;      // frames needed
    const MIN_INTERVAL = 150;   // min ms between detection runs to avoid glitching

    const run = async (ts: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(run);
      
      // Don't start another detection if one is already running
      if (detectRunning || !videoRef.current) return;
      
      // throttle frame rate
      if (ts - lastRun < MIN_INTERVAL) return;
      lastRun = ts;

      try {
        detectRunning = true;
        
        if (!ready) {
          await ensureFaceModels();
          // Preload candidates and descriptors just once
          await buildCandidateIndex();
          // Instead of computing all, we'll compute on demand
          ready = true;
        }
        const faceapi = await import(/* @vite-ignore */ '@vladmandic/face-api');
        const vid = videoRef.current as HTMLVideoElement;
        if (vid.videoWidth === 0 || vid.videoHeight === 0) return;
        const canvas = overlayRef.current;
        if (!canvas) return;
        
        // Resize canvas if needed
        if (canvas.width !== vid.clientWidth || canvas.height !== vid.clientHeight) {
          canvas.width = vid.clientWidth;
          canvas.height = vid.clientHeight;
        }
        
        // detect with more robust settings for beards
        let detections;
        
        // Try to use SSD detector which is better for bearded faces
        try {
          // Load the SSD MobileNet model (better with facial hair)
          await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
          detections = await faceapi
            .detectAllFaces(vid, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 }))
            .withFaceLandmarks()
            .withFaceDescriptors();
        } catch {
          // Fallback to TinyFaceDetector with better settings
          detections = await faceapi
            .detectAllFaces(vid, new faceapi.TinyFaceDetectorOptions({ 
              inputSize: 416, // Larger input size for more detail
              scoreThreshold: 0.15 // Lower threshold to detect more variations
            }))
            .withFaceLandmarks()
            .withFaceDescriptors();
        }

        // draw - create a clean context each time to avoid glitches
        
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;
        
        // Clear with a full reset
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;

        let bestName = '';
        let bestUserId: string | undefined = undefined;
        let bestDist = Number.POSITIVE_INFINITY;
        let bestBox: { x: number; y: number; w: number; h: number } | null = null;

        if (detections && detections.length > 0) {
          // compare first face (or the largest) to candidates
          const det = detections.sort((a,b) => (b.detection.box.area - a.detection.box.area))[0];
          const desc = Array.from(det.descriptor as Float32Array);
          // get candidates (already built in setup)
          const candidates = getCandidatesCache();
          
          // Process at most 3 candidates per frame to avoid stuttering
          let descriptorsComputed = 0;
          for (const c of candidates) {
            // Get descriptor for this candidate
            if (!c.desc && descriptorsComputed < 3) {
              try {
                descriptorsComputed++;
                const res = await fetch(c.imageUrl);
                const blob = await res.blob();
                const d = await faceDescriptorFromBlob(blob);
                if (d) c.desc = d;
              } catch {}
            }
            if (c.desc) {
              const d = euclidean(desc, c.desc);
              if (d < bestDist) { bestDist = d; bestName = c.fullName; bestUserId = c.userId; }
            }
          }
          const { x, y, width, height } = det.detection.box;
          // project box from video pixels to canvas CSS size
          const sx = canvas ? canvas.width / vid.videoWidth : 1;
          const sy = canvas ? canvas.height / vid.videoHeight : 1;
          bestBox = { x: x * sx, y: y * sy, w: width * sx, h: height * sy };
        } else {
          stable = 0;
        }

        if (bestBox && ctx && canvas) {
          // Save state before drawing
          ctx.save();
          
          // Animated green box with anti-aliasing
          ctx.strokeStyle = bestDist <= THRESH ? 'rgba(16,185,129,0.9)' : 'rgba(59,130,246,0.9)';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          // Use integer coordinates to avoid blurry lines
          const x = Math.round(bestBox.x);
          const y = Math.round(bestBox.y);
          const w = Math.round(bestBox.w);
          const h = Math.round(bestBox.h);
          
          ctx.strokeRect(x, y, w, h);
          
          // Label with shadow for readability
          const label = bestDist < Number.POSITIVE_INFINITY ? `${bestName || 'Detecting…'}` : 'Detecting…';
          ctx.font = '14px system-ui, -apple-system, sans-serif';
          
          // Measure text only once
          const pad = 6;
          const textMetrics = ctx.measureText(label);
          const textWidth = textMetrics.width;
          const bgWidth = textWidth + pad*2;
          
          // Draw name tag background
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(x, Math.max(0, y - 24), bgWidth, 22);
          
          // Draw text with proper anti-aliasing
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x + pad, Math.max(11, y - 13));

          // Show distance (for debugging)
          if (bestDist < Number.POSITIVE_INFINITY) {
            const distStr = bestDist.toFixed(2);
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(x, Math.max(0, y + h), 60, 22);
            ctx.fillStyle = bestDist <= THRESH ? 'rgb(16,185,129)' : '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.fillText(distStr, x + pad, Math.max(11, y + h + 11));
          }
          
          // Restore context state
          ctx.restore();
        }

        // trigger auto-mark if confident for a couple frames
        if (bestDist <= THRESH && bestName) stable++; else stable = 0;
        if (stable >= NEED) {
          const blob = await captureFrame();
          if (blob) {
            cancelled = true;
            cancelAnimationFrame(raf);
            // show confirmation overlay instead of immediate capture
            setPending({ name: bestName || 'Detected', userId: bestUserId, blob });
            return;
          }
        }
      } catch (error) {
        console.error('Face detection error:', error);
      } finally {
        detectRunning = false;
      }
    };

    raf = requestAnimationFrame(run);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetect, capturedImage, isNative, pending]);

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
          <>
            <video ref={videoRef} autoPlay playsInline muted className={videoClasses} />
            <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
          </>
        )}
        {pending && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm text-center border border-slate-200 animate-in fade-in-50 zoom-in-95">
              <div className="text-slate-900 font-semibold text-lg">{pending.name}</div>
              <div className="text-slate-600 text-sm mt-1 mb-5">Mark attendance in <span className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-900">{countdown}s</span></div>
              <div className="flex gap-3">
                <Button onClick={handleConfirmPending} className="flex-1 py-2">
                  <CheckCircleIcon className="w-5 h-5 mr-2" />
                  Confirm
                </Button>
                <Button onClick={handleCancelPending} variant="secondary" className="flex-1 py-2">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
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
