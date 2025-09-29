// Lightweight helpers to work with Capacitor Camera when running inside the Android app
// This file is safe to import on the web; it only dynamically imports the plugin at runtime.

export function isCapacitorAndroid(): boolean {
  const w = window as any;
  const cap = w?.Capacitor;
  if (!cap) return false;
  try {
    const platform = cap.getPlatform?.() || cap.Platform?.getPlatform?.();
    return String(platform).toLowerCase() === 'android';
  } catch {
    return false;
  }
}

export async function captureViaNativeCamera(): Promise<Blob | null> {
  // Use global Capacitor plugin access only to avoid bundler resolution of '@capacitor/camera' in web builds
  try {
    const w = window as any;
    const cap = w?.Capacitor;
    const Camera = cap?.Plugins?.Camera || w?.Camera; // try common globals
    if (!Camera) throw new Error('Camera plugin not available');

    // Some versions expose typed enums; otherwise use string fallbacks
    const res = await Camera.getPhoto({
      quality: 75,
      resultType: (Camera?.ResultType?.Uri ?? 'uri'),
      source: (Camera?.Source?.Camera ?? 'CAMERA'),
      saveToGallery: false,
      correctOrientation: true,
    });
    const webPath: string | undefined = res?.webPath || res?.path || res?.savedUri;
    if (!webPath) return null;
    const r = await fetch(webPath);
    return await r.blob();
  } catch (e) {
    console.warn('Native camera unavailable/failure, falling back to webcam', e);
    return null;
  }
}
