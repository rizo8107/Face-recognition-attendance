import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.attendance.kiosk',
  appName: 'Face Attendance',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  android: {
    iconPath: 'public/icon.png'
  },
  ios: {
    iconPath: 'public/icon.png'
  }
};

export default config;
