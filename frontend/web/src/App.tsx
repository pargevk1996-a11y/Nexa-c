import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { isEmailVerificationUiEnabled, isQrLoginEnabled } from "@/config/features";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SessionGate } from "@/components/SessionGate";
import { PrivacyRoot } from "@/components/privacy/PrivacyRoot";
import { PrivacyRouteSync } from "@/components/privacy/PrivacyRouteSync";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GuestRoute } from "@/components/GuestRoute";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LandingPage } from "@/pages/LandingPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

// LandingPage stays eager: it is the first paint for guests (home / login /
// register) and must not flash. Everything else is split into its own chunk
// and fetched on demand, so a logged-out visitor never downloads the chat,
// calls, media, or settings code. Named exports are adapted to lazy()'s
// default-export contract.
const AppShell = lazy(() =>
  import("@/components/layout/AppShell").then((m) => ({ default: m.AppShell })),
);
const ChatPage = lazy(() =>
  import("@/pages/ChatPage").then((m) => ({ default: m.ChatPage })),
);
const ContactsPage = lazy(() =>
  import("@/pages/ContactsPage").then((m) => ({ default: m.ContactsPage })),
);
const CallsPage = lazy(() =>
  import("@/pages/CallsPage").then((m) => ({ default: m.CallsPage })),
);

const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const UserProfilePage = lazy(() =>
  import("@/pages/UserProfilePage").then((m) => ({ default: m.UserProfilePage })),
);
const LegalPage = lazy(() =>
  import("@/pages/LegalPage").then((m) => ({ default: m.LegalPage })),
);
const SecurityDocPage = lazy(() =>
  import("@/pages/SecurityDocPage").then((m) => ({ default: m.SecurityDocPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
);
const VerifyEmailPage = lazy(() =>
  import("@/pages/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })),
);
const QrLoginPage = lazy(() =>
  import("@/pages/QrLoginPage").then((m) => ({ default: m.QrLoginPage })),
);
const OAuthCallbackPage = lazy(() =>
  import("@/pages/OAuthCallbackPage").then((m) => ({ default: m.OAuthCallbackPage })),
);

export default function App() {
  return (
    <ErrorBoundary>
    <PrivacyRoot>
    <SessionGate>
      <BrowserRouter>
      <PrivacyRouteSync />
      {/* fallback={null} keeps splitting invisible: no spinner that wasn't
          there before, and the briefly-fetched chunk swaps in seamlessly. */}
      <Suspense fallback={null}>
      <Routes>
        {/* Public legal/trust pages — reachable signed-in or out (BUG-023) */}
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/license" element={<LegalPage kind="license" />} />
        <Route path="/docs/security" element={<SecurityDocPage />} />

        <Route element={<GuestRoute />}>
          {/* "/" / "/login" / "/register" all show the landing page;
              GuestRoute redirects authenticated users straight to /app/chats */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LandingPage />} />
          <Route path="/register" element={<LandingPage />} />
          <Route element={<AuthLayout />}>
            <Route
              path="/login/qr"
              element={isQrLoginEnabled() ? <QrLoginPage /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/verify-email"
              element={
                isEmailVerificationUiEnabled() ? (
                  <VerifyEmailPage />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/app/chats" element={<ChatPage />} />
            <Route path="/app/contacts" element={<ContactsPage />} />

            <Route path="/app/calls" element={<CallsPage />} />

            <Route path="/app/settings" element={<SettingsPage />} />
            <Route path="/app/profile" element={<ProfilePage />} />
            <Route path="/app/user/:userId" element={<UserProfilePage />} />
          </Route>
          <Route path="/chat" element={<Navigate to="/app/chats" replace />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      </BrowserRouter>
    </SessionGate>
    </PrivacyRoot>
    </ErrorBoundary>
  );
}
