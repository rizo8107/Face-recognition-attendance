
import { useState, useRef, useCallback } from 'react';

export const useWebcam = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startWebcam = useCallback(async () => {
    setError(null);
    // Ensure any existing stream is fully stopped before requesting a new one
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    // Try a sequence of increasingly permissive constraints
    const constraintAttempts: MediaStreamConstraints[] = [
      { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } },
      { video: { facingMode: 'user' } },
      { video: true },
      { video: { width: 640, height: 480 } },
    ];

    let lastError: unknown = null;
    for (const constraints of constraintAttempts) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
        return; // success
      } catch (e) {
        lastError = e;
        // Continue to next attempt
      }
    }

    console.error('Error accessing webcam:', lastError);
    if (lastError && lastError instanceof Error) {
      switch (lastError.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          setError('Webcam access was denied. Please allow camera permissions in your browser settings.');
          break;
        case 'NotReadableError':
          setError('Could not start video source. Your camera may be in use by another application (Zoom/Teams/Meet) or blocked by privacy settings. Close other apps and try again.');
          break;
        case 'OverconstrainedError':
          setError('The requested camera settings are not supported by your device. Please try again.');
          break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
          setError('No camera was found. Please connect a webcam or enable it in device settings.');
          break;
        default:
          setError(`Could not start webcam: ${lastError.message}`);
      }
    } else {
      setError('An unknown error occurred while accessing the webcam.');
    }
  }, [stream]); // Re-create if stream exists to ensure cleanup

  const stopWebcam = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      if(videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  const captureFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve, reject) => {
      if (!videoRef.current) {
        reject(new Error("Video element not available."));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error("Could not get canvas context."));
        return;
      }
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });
  }, []);

  return { videoRef, stream, error, startWebcam, stopWebcam, captureFrame };
};
