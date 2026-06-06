import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { isEmailVerificationUiEnabled, isQrLoginEnabled } from "@/config/features";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SessionGate } from "@/components/SessionGate";
import { PrivacyRoot } from "@/components/privacy/PrivacyRoot";
import { PrivacyRouteSync } from "@/components/privacy/PrivacyRouteSync";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AppShell } from "@/components/layout/AppShell";
import { GuestRoute } from "@/components/GuestRoute";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CallsPage } from "@/pages/CallsPage";
import { ChatPage } from "@/pages/ChatPage";
import { ContactsPage } from "@/pages/ContactsPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { VerifyEmailPage } from "@/pages/VerifyEmailPage";
import { QrLoginPage } from "@/pages/QrLoginPage";
import { OAuthCallbackPage } from "@/pages/OAuthCallbackPage";
import { PostsPage } from "@/pages/PostsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { UserProfilePage } from "@/pages/UserProfilePage";

export default function App() {
  return (
    <ErrorBoundary>
    <PrivacyRoot>
    <SessionGate>
      <BrowserRouter>
      <PrivacyRouteSync />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route element={<GuestRoute />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/login/qr"
              element={isQrLoginEnabled() ? <QrLoginPage /> : <Navigate to="/login" replace />}
            />
            <Route path="/register" element={<RegisterPage />} />
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
            <Route path="/app/stories" element={<Navigate to="/app/chats" replace />} />
            <Route path="/app/calls" element={<CallsPage />} />
            <Route path="/app/posts" element={<PostsPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
            <Route path="/app/profile" element={<ProfilePage />} />
            <Route path="/app/user/:userId" element={<UserProfilePage />} />
          </Route>
          <Route path="/chat" element={<Navigate to="/app/chats" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </BrowserRouter>
    </SessionGate>
    </PrivacyRoot>
    </ErrorBoundary>
  );
}
