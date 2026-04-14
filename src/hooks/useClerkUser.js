/**
 * useClerkUser — safe wrapper around Clerk's useUser hook.
 *
 * Returns { id, email } when Clerk is configured and the user is signed in.
 * Returns null otherwise. Safe to call unconditionally in any component.
 *
 * CLERK_KEY is a build-time constant (process.env replaced by webpack),
 * so the conditional early-return is deterministic across renders.
 */

import { useUser } from "@clerk/clerk-react";

const CLERK_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

export function useClerkUser() {
  // When Clerk is not configured, ClerkProvider is absent — skip the hook.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const clerkResult = CLERK_KEY ? useUser() : { isSignedIn: false, user: null };

  if (!clerkResult.isSignedIn || !clerkResult.user) {
    return null;
  }

  return {
    id: clerkResult.user.id,
    email: clerkResult.user.primaryEmailAddress?.emailAddress || "",
  };
}
