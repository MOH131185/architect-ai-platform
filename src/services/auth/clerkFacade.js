import React from "react";
import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from "@clerk/clerk-react";

const CLERK_PUBLISHABLE_KEY = (
  process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || ""
).trim();

export const clerkAuthConfigured = Boolean(CLERK_PUBLISHABLE_KEY);

const FALLBACK_AUTH = Object.freeze({
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  sessionId: null,
  actor: null,
  orgId: null,
  orgRole: null,
  orgSlug: null,
  has: () => false,
  signOut: async () => undefined,
  getToken: async () => null,
});

export function OptionalClerkProvider({ children }) {
  if (!clerkAuthConfigured) {
    return children;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}

export function useOptionalAuth() {
  try {
    return useAuth();
  } catch (_error) {
    return FALLBACK_AUTH;
  }
}

export function AuthSignedIn({ children }) {
  if (!clerkAuthConfigured) {
    return children;
  }

  return <SignedIn>{children}</SignedIn>;
}

export function AuthSignedOut({ children }) {
  if (!clerkAuthConfigured) {
    return null;
  }

  return <SignedOut>{children}</SignedOut>;
}

export function AuthSignInButton({ children, ...props }) {
  if (!clerkAuthConfigured) {
    return children;
  }

  return <SignInButton {...props}>{children}</SignInButton>;
}

export function AuthUserButton(props) {
  if (!clerkAuthConfigured) {
    return null;
  }

  return <UserButton {...props} />;
}

export default {
  clerkAuthConfigured,
  OptionalClerkProvider,
  useOptionalAuth,
  AuthSignedIn,
  AuthSignedOut,
  AuthSignInButton,
  AuthUserButton,
};
