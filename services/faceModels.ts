import * as tf from '@tensorflow/tfjs';

let modelsReady = false;
let preparing = false;
let ssdReady = false;

// Flag to prevent parallel model loads
let modelLoadPromise: Promise<void> | null = null;

export async function ensureFaceModels(basePath: string = '/models') {
  // Return immediately if models are ready
  if (modelsReady) return;
  
  // If already loading, wait for that promise
  if (preparing && modelLoadPromise) {
    await modelLoadPromise;
    return;
  }
  
  // Start loading process
  preparing = true;
  
  // Create a promise that other calls can wait on
  modelLoadPromise = (async () => {
    console.time('face-models-load');
    try {
      // Aggressively optimize for performance
      console.log('Setting up TensorFlow backend');
      try {
        // WASM is more reliable on mobile than WebGL
        await tf.setBackend('wasm');
        await tf.enableProdMode(); // Disable debug checks for speed
        await tf.ready();
        console.log('TensorFlow backend ready:', tf.getBackend());
      } catch (e) {
        console.warn('Failed to set TensorFlow backend:', e);
      }

      const faceapi = await import(/* @vite-ignore */ '@vladmandic/face-api');
      console.log('Face API imported successfully');

      async function tryLoadFrom(uri: string) {
        console.log('Loading face models from:', uri);
        // For Android, only load the TinyFaceDetector - much faster
        // and smaller memory footprint
        await faceapi.nets.tinyFaceDetector.loadFromUri(uri);
        await faceapi.nets.faceLandmark68Net.loadFromUri(uri);
        await faceapi.nets.faceRecognitionNet.loadFromUri(uri);
        console.log('TinyFaceDetector model loaded successfully');
        
        // Skip SSD on mobile for better performance
        if (typeof navigator !== 'undefined' && !navigator.userAgent.includes('Android')) {
          try {
            console.log('Loading SSD model (skipped on Android)');
            // await faceapi.nets.ssdMobilenetv1.loadFromUri(uri);
            // ssdReady = true;
          } catch (e) {
            console.warn('SSD model could not be loaded', e);
          }
        }
      }

      // try local public/models/, fallback to CDN
      try {
        await tryLoadFrom(basePath);
      } catch {
        await tryLoadFrom('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
      }

      modelsReady = true;
      console.timeEnd('face-models-load');
    } catch (error) {
      console.error('Error loading face models:', error);
    } finally {
      preparing = false;
    }
  })();  // Execute the promise
  
  // Return the promise so the caller can await it
  return modelLoadPromise;
}
