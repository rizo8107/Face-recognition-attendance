// Lightweight helpers to work with Capacitor Camera when running inside the Android app
// This file is safe to import on the web; it only dynamically imports the plugin at runtime.

export function isCapacitorAndroid(): boolean {
  const w = window as any;
  const cap = w?.Capacitor;
  if (!cap) {
    console.log("Capacitor not available in this environment");
    return false;
  }
  try {
    const platform = cap.getPlatform?.() || cap.Platform?.getPlatform?.();
    console.log("Detected platform:", platform);
    return String(platform).toLowerCase() === 'android';
  } catch (e) {
    console.error("Error detecting platform:", e);
    return false;
  }
}

export async function captureViaNativeCamera(): Promise<Blob | null> {
  // Use global Capacitor plugin access only to avoid bundler resolution of '@capacitor/camera' in web builds
  try {
    console.log("Attempting to capture via native camera...");
    const w = window as any;
    const cap = w?.Capacitor;
    
    if (!cap) {
      console.error("Capacitor not found in window object");
      throw new Error('Capacitor not available');
    }
    
    // Check permissions first
    if (cap.Plugins?.Permissions) {
      try {
        const { camera } = cap.Plugins.Permissions;
        console.log("Checking camera permissions...");
        const permResult = await camera.checkPermissions();
        console.log("Camera permission status:", permResult);
        
        if (permResult.camera !== 'granted') {
          console.log("Requesting camera permission...");
          const requested = await camera.requestPermissions({ permissions: ['camera'] });
          console.log("Permission request result:", requested);
        }
      } catch (permError) {
        console.error("Error handling permissions:", permError);
      }
    }
    
    const Camera = cap?.Plugins?.Camera || w?.Camera; // try common globals
    if (!Camera) {
      console.error("Camera plugin not available in", Object.keys(cap.Plugins || {}));
      throw new Error('Camera plugin not available');
    }

    console.log("Camera plugin found, attempting to get photo...");
    
    // Some versions expose typed enums; otherwise use string fallbacks
    const res = await Camera.getPhoto({
      quality: 75,
      resultType: (Camera?.ResultType?.Uri ?? 'uri'),
      source: (Camera?.Source?.Camera ?? 'CAMERA'),
      saveToGallery: false,
      correctOrientation: true,
      width: 800,
      height: 600
    });
    
    console.log("Photo captured:", res);
    
    const webPath: string | undefined = res?.webPath || res?.path || res?.savedUri;
    if (!webPath) {
      console.error("No webPath in camera result", res);
      return null;
    }
    
    console.log("Fetching from webPath:", webPath);
    const r = await fetch(webPath);
    const blob = await r.blob();
    console.log("Blob created successfully:", blob.type, blob.size, "bytes");
    return blob;
  } catch (e) {
    console.error('Native camera error with details:', e);
    return null;
  }
}
