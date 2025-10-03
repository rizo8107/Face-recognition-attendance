import { ensureFaceModels } from './faceModels';

export async function faceDescriptorFromBlob(blob: Blob): Promise<number[] | null> {
  await ensureFaceModels();
  const faceapi = await import(/* @vite-ignore */ '@vladmandic/face-api');
  const imgUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject as any;
      i.src = imgUrl;
    });
    
    // Try different detectors and settings for better beard detection
    const tinyDetectorOptions = [
      // Lower thresholds for beards, larger inputs for more detail
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.15 }), // Larger model, very low threshold
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 }),
      new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }),
    ];
    
    // Try SSD detector which is better for facial variations like beards
    try {
      // First attempt with SSD MobileNet - better for facial hair
      await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
      const ssdDet = await faceapi
        .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (ssdDet?.descriptor) return Array.from(ssdDet.descriptor as Float32Array);
    } catch {
      // SSD may not be loaded, continue with Tiny detector
    }
    
    // Try TinyFaceDetector with various settings
    for (const opt of tinyDetectorOptions) {
      try {
        const det = await faceapi
          .detectSingleFace(img, opt)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (det?.descriptor) return Array.from(det.descriptor as Float32Array);
      } catch {}
    }
    
    // Fallback to detect all faces and find the most prominent
    try {
      const allFaces = await faceapi
        .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.1 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
        
      if (allFaces && allFaces.length > 0) {
        // Sort by box area (largest face first)
        allFaces.sort((a, b) => b.detection.box.area - a.detection.box.area);
        const best = allFaces[0];
        if (best?.descriptor) return Array.from(best.descriptor as Float32Array);
      }
    } catch {}
    
    return null;
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

export function euclidean(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}
