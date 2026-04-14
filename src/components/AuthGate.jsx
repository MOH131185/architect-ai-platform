/**
 * AuthGate — protects content behind Clerk authentication.
 *
 * If Clerk is not configured, renders children directly (open access).
 * If configured but user is signed out, shows a sign-in prompt.
 */

import React from "react";
import PropTypes from "prop-types";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";

const CLERK_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

const AuthGate = ({ children }) => {
  // No Clerk configured — allow open access
  if (!CLERK_KEY) {
    return <>{children}</>;
  }

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <div className="bg-navy-900/80 border border-navy-700 rounded-2xl p-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-2xl font-bold text-white mb-3">
              Sign in to continue
            </h2>
            <p className="text-gray-400 mb-6">
              Create a free account to start generating AI architectural
              designs. No credit card required.
            </p>
            <SignInButton mode="modal">
              <button className="w-full px-6 py-3 text-base font-semibold text-white bg-gradient-to-r from-royal-600 to-royal-400 hover:from-royal-500 hover:to-royal-300 rounded-xl transition-all shadow-lg shadow-royal-600/25">
                Sign In / Sign Up
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
    </>
  );
};

AuthGate.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AuthGate;
