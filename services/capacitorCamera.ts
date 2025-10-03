// Direct implementation of Capacitor Camera
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export async function checkCameraAvailability() {
  try {
    // Check if plugin is available
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w?.Capacitor?.isPluginAvailable) {
        const available = w.Capacitor.isPluginAvailable('Camera');
        console.log("Camera plugin availability:", available);
        return available;
      } else {
        console.log("Capacitor isPluginAvailable method not found");
        return false;
      }
    }
    return false;
  } catch (err) {
    console.error("Error checking camera availability:", err);
    return false;
  }
}

export async function requestCameraPermissions() {
  try {
    const permissions = await Camera.checkPermissions();
    console.log("Current camera permissions:", permissions);
    
    if (permissions.camera !== 'granted') {
      console.log("Camera permission not granted, requesting...");
      const requestResult = await Camera.requestPermissions({
        permissions: ['camera']
      });
      console.log("Permission request result:", requestResult);
      return requestResult.camera === 'granted';
    }
    return true;
  } catch (err) {
    console.error("Error requesting camera permissions:", err);
    return false;
  }
}

export async function takePicture(): Promise<Blob | null> {
  try {
    console.log("Taking picture with Capacitor Camera...");
    
    // Request permissions first
    const hasPermission = await requestCameraPermissions();
    if (!hasPermission) {
      console.log("No camera permissions granted");
      return null;
    }
    
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      width: 800,
      height: 800,
      preserveAspectRatio: true,
      correctOrientation: true
    });
    
    console.log("Photo captured:", image);
    
    // Get the blob from URI
    if (image.webPath) {
      try {
        console.log("Fetching from webPath:", image.webPath);
        const response = await fetch(image.webPath);
        const blob = await response.blob();
        console.log("Blob created successfully:", blob.type, blob.size, "bytes");
        return blob;
      } catch (err) {
        console.error("Error converting webPath to blob:", err);
      }
    } else {
      console.log("No webPath in camera result");
    }
    
    return null;
  } catch (err) {
    console.error("Error taking picture:", err);
    return null;
  }
}
