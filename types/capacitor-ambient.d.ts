// Ambient declarations to avoid TS-errors when developing on web without Capacitor packages installed.
// These are overridden by real types once you install @capacitor/* packages.

declare module '@capacitor/camera' {
  export const Camera: any;
  export const CameraSource: any;
  export const CameraResultType: any;
}

declare module '@capacitor/cli' {
  export type CapacitorConfig = any;
}
