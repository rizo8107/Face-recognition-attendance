
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWebcam } from '../hooks/useWebcam';
import Button from './common/Button';
import { CameraIcon, RefreshIcon, CheckCircleIcon, PowerIcon, UserCircleIcon, XCircleIcon } from './common/Icons';
import { blobToSigVector, cosineSim } from '../services/sigService';
import { isCapacitorAndroid, captureViaNativeCamera } from '../services/nativeCamera';
import { takePicture, checkCameraAvailability, requestCameraPermissions } from '../services/capacitorCamera';
// Ensure Camera plugin is loaded
import '@capacitor/camera';
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

  // Request camera permissions at startup and check availability
  useEffect(() => {
    const initCamera = async () => {
      try {
        // First check if camera is available
        const isAvailable = await checkCameraAvailability();
        console.log("Camera availability check result:", isAvailable);
        
        // Then request permissions if available
        if (isAvailable) {
          const hasPermission = await requestCameraPermissions();
          console.log("Camera permission status after request:", hasPermission);
        }
      } catch (e) {
        console.error("Error initializing camera:", e);
      }
    };
    
    // Initialize camera on component mount
    initCamera();
  }, []);
  
  useEffect(() => {
    if (isNative) {
      // Optionally auto-open camera when autoDetect is enabled
      (async () => {
        if (autoDetect && !capturedBlob) {
          console.log("Auto-opening native camera...");
          const b = await captureViaNativeCamera();
          if (b) {
            setCapturedBlob(b);
            setCapturedImage(URL.createObjectURL(b));
          }
        }
      })();
      return;
    }
    console.log("Starting webcam stream...");
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
    try {
      console.log("Capture button clicked, isNative:", isNative);
      if (isNative) {
        // First try our direct implementation
        try {
          console.log("Using direct Capacitor Camera implementation");
          const blob = await takePicture();
          if (blob) {
            console.log("Direct camera capture successful, blob size:", blob.size);
            setCapturedBlob(blob);
            setCapturedImage(URL.createObjectURL(blob));
            return;
          } else {
            console.warn("Direct camera implementation returned null, trying legacy method");
          }
        } catch (directErr) {
          console.error("Error using direct camera implementation:", directErr);
        }
        
        // Fall back to legacy implementation
        try {
          console.log("Falling back to legacy native camera implementation");
          const blob = await captureViaNativeCamera();
          if (blob) {
            console.log("Legacy native camera capture successful");
            setCapturedBlob(blob);
            setCapturedImage(URL.createObjectURL(blob));
          } else {
            console.error("Legacy camera returned null blob");
            throw new Error("Failed to get image from legacy camera implementation");
          }
        } catch (legacyErr) {
          console.error("Error in legacy camera capture, trying web fallback:", legacyErr);
          // Last resort - try web camera
          if (!isNative || confirm("Camera access failed. Try using web camera instead?")) {
            const fallbackBlob = await captureFrame();
            if (fallbackBlob) {
              setCapturedBlob(fallbackBlob);
              setCapturedImage(URL.createObjectURL(fallbackBlob));
              stopWebcam();
            } else {
              console.error("All camera methods failed");
              alert("Unable to access camera. Please check your permissions.");
            }
          }
        }
      } else {
        // Regular webcam flow
        const blob = await captureFrame();
        if (blob) {
          setCapturedBlob(blob);
          setCapturedImage(URL.createObjectURL(blob));
          stopWebcam();
        } else {
          console.error("Web camera capture failed");
          alert("Unable to capture from webcam. Please try again.");
        }
      }
    } catch (err) {
      console.error("General error in handleCapture:", err);
      alert("Camera error. Please check permissions and try again.");
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

  const videoContainerClasses = "relative w-full aspect-[4/3] bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-200 flex items-center justify-center";
  const videoClasses = "w-full h-full object-cover";

  if (error) {
    return (
      <div className={`${videoContainerClasses} flex-col p-0 text-center overflow-hidden`}>
        <div className="bg-red-50 p-5 w-full">
          <div className="bg-white rounded-full p-2 inline-block mb-2 shadow-sm">
            <XCircleIcon className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="font-semibold text-red-700">Camera Error</h3>
        </div>
        
        <div className="p-6">
          <p className="text-slate-700 mb-4">{error}</p>
          <button 
            onClick={startWebcam} 
            className="flex items-center justify-center py-2 px-5 mx-auto bg-[#0A3172] hover:bg-[#072658] text-white font-medium rounded-lg shadow-sm transition-all duration-200">
            <RefreshIcon className="w-5 h-5 mr-2" />
            Retry Camera Access
          </button>
        </div>
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
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm text-center border border-gray-200 overflow-hidden animate-in fade-in-50">
              {/* Header */}
              <div className="bg-[#0A3172] p-4 text-white text-center relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-teal-400"></div>
                <div className="bg-white rounded-full p-2 inline-block mb-2">
                  <UserCircleIcon className="w-7 h-7 text-[#0A3172]" />
                </div>
                <div className="text-lg font-bold">{pending.name}</div>
              </div>
              
              <div className="p-5">
                <div className="bg-blue-50 rounded-lg p-3 mb-5 text-center">
                  <span className="text-[#0A3172] font-medium">Mark attendance in </span>
                  <span className="font-mono bg-[#0A3172] text-white px-3 py-1 rounded-lg ml-1 font-semibold">{countdown}</span>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={handleConfirmPending} 
                    className="flex-1 flex items-center justify-center py-3 px-4 bg-[#0A3172] hover:bg-[#072658] text-white font-medium rounded-lg shadow-sm transition-all duration-200">
                    <CheckCircleIcon className="w-5 h-5 mr-2" />
                    Confirm
                  </button>
                  
                  <button 
                    onClick={handleCancelPending} 
                    className="flex-1 flex items-center justify-center py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg shadow-sm transition-all duration-200">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {!isNative && !stream && !capturedImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A3172]/5 backdrop-blur-sm">
            <div className="w-10 h-10 border-4 border-t-[#0A3172] border-r-[#0A3172] border-b-[#0A3172]/30 border-l-[#0A3172]/30 rounded-full animate-spin mb-3"></div>
            <p className="text-sm font-medium text-[#0A3172]">Starting camera…</p>
          </div>
        )}
      </div>

      <div className="flex w-full justify-center gap-3 max-sm:flex-col">
        {capturedImage ? (
          <>
            <button 
              onClick={handleRetake} 
              className="flex-1 flex items-center justify-center py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl shadow-sm transition-all duration-200">
              <RefreshIcon className="w-5 h-5 mr-2" />
              Retake
            </button>
            <button 
              onClick={handleConfirm} 
              className="flex-1 flex items-center justify-center py-3 px-4 bg-[#0A3172] hover:bg-[#072658] text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-200">
              <CheckCircleIcon className="w-5 h-5 mr-2" />
              Confirm
            </button>
          </>
        ) : (
          <>
            {isNative ? (
              <button 
                onClick={() => {
                  try {
                    console.log("Direct camera button clicked");
                    // Use import to get direct access to Camera
                    import('@capacitor/camera').then(async ({ Camera, CameraResultType, CameraSource }) => {
                      console.log("Imported Camera plugin", Camera);
                      try {
                        // Request permissions first
                        console.log("Requesting permissions");
                        const permissions = await Camera.requestPermissions();
                        console.log("Permission result:", permissions);

                        // Take the photo
                        console.log("Taking photo...");
                        const image = await Camera.getPhoto({
                          quality: 90,
                          resultType: CameraResultType.Uri,
                          source: CameraSource.Camera,
                          saveToGallery: false
                        });
                        console.log("Photo result:", image);

                        if (image.webPath) {
                          try {
                            console.log("Got webPath, fetching blob:", image.webPath);
                            const response = await fetch(image.webPath);
                            const blob = await response.blob();
                            console.log("Blob created:", blob.type, blob.size);
                            setCapturedBlob(blob);
                            setCapturedImage(URL.createObjectURL(blob));
                          } catch (blobErr) {
                            console.error("Error getting blob:", blobErr);
                            alert("Failed to process image. Please try again.");
                          }
                        } else {
                          console.error("No webPath in camera result");
                          alert("No image path returned. Please try again.");
                        }
                      } catch (cameraErr) {
                        console.error("Camera error:", cameraErr);
                        alert("Camera error: " + (cameraErr.message || "Unknown error"));
                      }
                    }).catch(importErr => {
                      console.error("Failed to import Camera:", importErr);
                      alert("Failed to access camera system. Please check permissions.");
                    });
                  } catch (err) {
                    console.error("Top level camera error:", err);
                    alert("Camera system error. Please check permissions.");
                  }
                }}
                className="flex-1 flex items-center justify-center py-3 px-4 bg-[#0A3172] hover:bg-[#072658] text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
              >
                <CameraIcon className="w-5 h-5 mr-2" />
                {captureButtonText}
              </button>
            ) : (
              <button 
                onClick={handleCapture} 
                disabled={!stream} 
                className={`flex-1 flex items-center justify-center py-3 px-4 font-medium rounded-xl shadow-md transition-all duration-200 ${stream ? 'bg-[#0A3172] hover:bg-[#072658] text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                <CameraIcon className="w-5 h-5 mr-2" />
                {captureButtonText}
              </button>
            )}
            <button 
              onClick={stopWebcam} 
              disabled={!stream} 
              title="Stop Camera"
              className={`w-12 h-12 flex items-center justify-center rounded-full shadow-sm transition-all duration-200 ${stream ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
              <PowerIcon className="w-5 h-5"/>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default WebcamCapture;
