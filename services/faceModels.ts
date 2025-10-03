import * as tf from '@tensorflow/tfjs';

let modelsReady = false;
let preparing = false;

export async function ensureFaceModels(basePath: string = '/models') {
  if (modelsReady || preparing) return;
  preparing = true;
  try {
    // Prefer WebGL for speed
    try {
      await tf.setBackend('webgl');
      await tf.ready();
    } catch {}

    const faceapi = await import(/* @vite-ignore */ '@vladmandic/face-api');

    async function tryLoadFrom(uri: string) {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(uri),
        faceapi.nets.faceLandmark68Net.loadFromUri(uri),
        faceapi.nets.faceRecognitionNet.loadFromUri(uri),
      ]);
    }

    // try local public/models/, fallback to CDN
    try {
      await tryLoadFrom(basePath);
    } catch {
      await tryLoadFrom('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
    }

    modelsReady = true;
  } finally {
    preparing = false;
  }
}
