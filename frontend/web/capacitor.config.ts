import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexa.messenger',
  appName: 'Nexa',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
