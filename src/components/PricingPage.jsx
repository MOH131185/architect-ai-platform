/**
 * PricingPage — subscription plans UI.
 * Shown as a top-level state-driven view (no router).
 * Triggered from NavBar "Pricing" link or inline upgrade CTA.
 */

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, ArrowLeft } from "lucide-react";
import { PLANS } from "../config/plans.js";
import {
  AuthSignInButton,
  AuthSignedIn,
  AuthSignedOut,
  clerkAuthConfigured,
  useOptionalAuth,
} from "../services/auth/clerkFacade.js";

const PLAN_ORDER = ["free", "starter", "professional", "enterprise"];

const PLAN_FEATURES = {
  free: ["2 A1 sheets/month", "DNA-Enhanced pipeline", "Basic export"],
  starter: [
    "5 A1 sheets/month",
    "DNA-Enhanced pipeline",
    "All export formats",
    "Priority support",
  ],
  professional: [
    "20 A1 sheets/month",
    "DNA-Enhanced pipeline",
    "All export formats",
    "Priority support",
    "AI Modify workflow",
  ],
  enterprise: [
    "Unlimited A1 sheets",
    "DNA-Enhanced pipeline",
    "All export formats",
    "Dedicated support",
    "AI Modify workflow",
    "Custom integrations",
  ],
};

const PricingCard = ({ planKey, onUpgrade, loading }) => {
  const plan = PLANS[planKey];
  const features = PLAN_FEATURES[planKey] || [];
  const isEnterprise = planKey === "enterprise";
  const isFree = planKey === "free";
  const isPopular = planKey === "professional";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex flex-col rounded-2xl border p-6 ${
        isPopular
          ? "border-royal-500 bg-navy-900/80 shadow-glow"
          : "border-navy-700 bg-navy-900/50"
      }`}
    >
      {isPopular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-royal-500 text-white text-xs font-bold px-3 py-1 rounded-full">
          Most Popular
        </span>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold text-white">{plan.label}</h3>
        <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
      </div>

      <div className="mb-6">
        {isFree ? (
          <span className="text-4xl font-extrabold text-white">Free</span>
        ) : isEnterprise ? (
          <span className="text-4xl font-extrabold text-white">
            ${plan.price}
            <span className="text-base font-normal text-gray-400">/mo</span>
          </span>
        ) : (
          <span className="text-4xl font-extrabold text-white">
            ${plan.price}
            <span className="text-base font-normal text-gray-400">/mo</span>
          </span>
        )}
      </div>

      <ul className="space-y-2 mb-8 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
            <Check className="w-4 h-4 text-royal-400 flex-shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      <AuthSignedIn>
        {!clerkAuthConfigured && !isFree ? (
          <a
            href="mailto:hello@archiaisolution.pro?subject=Subscription Access"
            className="block w-full text-center py-2 rounded-lg text-sm font-medium bg-navy-800 text-gray-300 hover:bg-navy-700 border border-navy-700 transition-colors"
          >
            Contact us
          </a>
        ) : isFree ? (
          <button
            disabled
            className="w-full py-2 rounded-lg text-sm font-medium bg-navy-800 text-gray-500 cursor-default border border-navy-700"
          >
            Current free plan
          </button>
        ) : isEnterprise ? (
          <a
            href="mailto:hello@archiaisolution.pro?subject=Enterprise Plan"
            className="block w-full text-center py-2 rounded-lg text-sm font-medium bg-navy-800 text-gray-300 hover:bg-navy-700 border border-navy-700 transition-colors"
          >
            Contact us
          </a>
        ) : (
          <button
            onClick={() => onUpgrade(plan.priceId)}
            disabled={loading === planKey || !plan.priceId}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
              isPopular
                ? "bg-royal-600 hover:bg-royal-500 text-white"
                : "bg-navy-800 hover:bg-navy-700 text-white border border-navy-700"
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {loading === planKey ? (
              <span className="flex items-center justify-center gap-2">
                <Zap className="w-4 h-4 animate-spin" />
                Redirecting...
              </span>
            ) : (
              "Subscribe"
            )}
          </button>
        )}
      </AuthSignedIn>

      <AuthSignedOut>
        <AuthSignInButton mode="modal">
          <button className="w-full py-2 rounded-lg text-sm font-medium bg-royal-600 hover:bg-royal-500 text-white transition-colors">
            Sign in to subscribe
          </button>
        </AuthSignInButton>
      </AuthSignedOut>
    </motion.div>
  );
};

const PricingPage = ({ onBack }) => {
  const { getToken } = useOptionalAuth();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);

  const handleUpgrade = async (priceId) => {
    if (!priceId) return;
    const planKey = PLAN_ORDER.find((k) => PLANS[k].priceId === priceId);
    setLoading(planKey || "loading");
    setError(null);

    try {
      if (!clerkAuthConfigured) {
        throw new Error(
          "Authentication is not configured for this deployment. Contact support to subscribe.",
        );
      }
      const token = await getToken();
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not create checkout session");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-5xl">
        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to wizard
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-12">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-extrabold text-white mb-3"
          >
            Simple, transparent pricing
          </motion.h1>
          <p className="text-gray-400 text-lg">
            Generate professional RIBA-standard A1 architectural sheets with AI.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLAN_ORDER.map((key) => (
            <PricingCard
              key={key}
              planKey={key}
              onUpgrade={handleUpgrade}
              loading={loading}
            />
          ))}
        </div>

        <p className="text-center text-xs text-gray-500 mt-8">
          Prices in USD. Cancel anytime. Stripe handles all billing securely.
        </p>
      </div>
    </div>
  );
};

export default PricingPage;
