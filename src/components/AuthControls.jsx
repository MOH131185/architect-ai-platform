/**
 * AuthControls — Clerk sign-in / user button + plan badge.
 *
 * Renders nothing when Clerk is not configured (no publishable key).
 * When configured:
 *   - Signed out: shows a "Sign In" button
 *   - Signed in: shows the Clerk UserButton + plan/usage badge
 */

import React from "react";
import PropTypes from "prop-types";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/clerk-react";

const CLERK_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

const AuthControls = ({ onPricingClick }) => {
  // If Clerk is not configured, don't render auth controls
  if (!CLERK_KEY) {
    return null;
  }

  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="px-4 py-2 text-sm font-medium text-white bg-royal-600 hover:bg-royal-500 rounded-lg transition-colors">
            Sign In
          </button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        <div className="flex items-center gap-3">
          <PlanBadge onPricingClick={onPricingClick} />
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-9 h-9",
              },
            }}
          />
        </div>
      </SignedIn>
    </>
  );
};

/**
 * Small badge showing current plan and usage.
 * Reads from sessionStorage where the generation check result is cached.
 */
const PlanBadge = ({ onPricingClick }) => {
  const planColors = {
    free: "bg-gray-700 text-gray-300",
    starter: "bg-blue-900 text-blue-300",
    professional: "bg-purple-900 text-purple-300",
    enterprise: "bg-amber-900 text-amber-300",
  };

  // Read cached usage from sessionStorage (set by the generation hook)
  let plan = "free";
  let remaining = null;
  try {
    const cached = sessionStorage.getItem("archiAI_usage");
    if (cached) {
      const parsed = JSON.parse(cached);
      plan = parsed.plan || "free";
      remaining = parsed.remaining;
    }
  } catch {
    // ignore
  }

  const colorClass = planColors[plan] || planColors.free;
  const label = plan.charAt(0).toUpperCase() + plan.slice(1);

  return (
    <button
      onClick={onPricingClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass} hover:opacity-80 transition-opacity`}
      title="View plans & usage"
    >
      <span>{label}</span>
      {remaining !== null && remaining !== undefined && (
        <span className="opacity-70">
          {remaining === Infinity ? "Unlimited" : `${remaining} left`}
        </span>
      )}
    </button>
  );
};

AuthControls.propTypes = {
  onPricingClick: PropTypes.func,
};

export default AuthControls;
