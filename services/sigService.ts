// Lightweight image signature utilities to shortlist candidates before Gemini
// Strategy: downscale to 16x16 grayscale, L2-normalize to a vector, cosine similarity

export type SigVector = Float32Array; // length 256

function drawToCanvas(img: CanvasImageSource, w = 16, h = 16): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img as any, 0, 0, w, h);
  return canvas;
}

function rgbaToGray(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function canvasToSigVector(canvas: HTMLCanvasElement): SigVector {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const vec = new Float32Array(width * height);
  let sumSq = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const gray = rgbaToGray(data[i], data[i + 1], data[i + 2]);
      vec[y * width + x] = gray;
      sumSq += gray * gray;
    }
  }
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

export async function blobToSigVector(blob: Blob): Promise<SigVector> {
  const bmp = await createImageBitmap(blob);
  const canvas = drawToCanvas(bmp, 16, 16);
  const vec = canvasToSigVector(canvas);
  try { (bmp as any).close?.(); } catch {}
  return vec;
}

export async function urlToSigVector(url: string): Promise<SigVector> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const loaded: Promise<void> = new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });
  img.src = url;
  await loaded;
  const canvas = drawToCanvas(img, 16, 16);
  return canvasToSigVector(canvas);
}

export async function urlBlobToSigVector(url: string): Promise<SigVector> {
  const res = await fetch(url);
  const blob = await res.blob();
  return blobToSigVector(blob);
}

export function cosineSim(a: SigVector, b: SigVector): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are normalized, so dot is cosine similarity in [-1,1]
}
