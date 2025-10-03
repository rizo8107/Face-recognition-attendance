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
    const tries = [
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 }),
      new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }),
      new faceapi.TinyFaceDetectorOptions({ inputSize: 192, scoreThreshold: 0.4 }),
    ];
    for (const opt of tries) {
      const det = await faceapi
        .detectSingleFace(img, opt)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (det && det.descriptor) return Array.from(det.descriptor as Float32Array);
    }
    for (const opt of tries) {
      const all = await faceapi
        .detectAllFaces(img, opt)
        .withFaceLandmarks()
        .withFaceDescriptors();
      if (all && all.length) {
        all.sort((a: any, b: any) => b.detection.box.area - a.detection.box.area);
        const best = all[0];
        if (best?.descriptor) return Array.from(best.descriptor as Float32Array);
      }
    }
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
