import { Slot } from "expo-router";
import { useEffect } from "react";
import { Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as ScreenCapture from "expo-screen-capture";

export default function RootLayout() {
  // Block screen capture app-wide.
  // Android: sets FLAG_SECURE → screenshots AND screen recording are fully
  //          blocked by the OS (the capture comes out black).
  // iOS:     blocks screen recording; Apple does NOT allow blocking a still
  //          screenshot, so we additionally detect them as a deterrent.
  ScreenCapture.usePreventScreenCapture();

  useEffect(() => {
    let mounted = true;
    void ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    const sub = ScreenCapture.addScreenshotListener(() => {
      if (!mounted) return;
      Alert.alert(
        "Screenshots are not allowed",
        "For your security, capturing the Nexa screen is restricted.",
      );
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <Slot />
    </SafeAreaProvider>
  );
}
