/**
 * PricingPage — 3 plan cards + enterprise tile. Subscribe buttons hit
 * /api/stripe/create-checkout and redirect to Stripe-hosted checkout.
 */

import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, ArrowLeft } from "lucide-react";
import { useAuth, SignInButton, useUser } from "@clerk/clerk-react";
import { PLANS, PLAN_IDS, PLAN_ORDER, formatLimit } from "../config/plans.js";
import { Card } from "./ui";
import Button from "./ui/Button.jsx";

const PricingPage = ({ onBack }) => {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [currentPlan, setCurrentPlan] = useState(null);
  const [busyPlanId, setBusyPlanId] = useState(null);
  const [error, setError] = useState(null);

  // Fetch current plan so we can mark it as "Current".
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCurrentPlan(data.plan);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  const handleSubscribe = useCallback(
    async (planId) => {
      setError(null);
      const plan = PLANS[planId];
      if (!plan?.priceId) {
        setError(
          `${plan.name} plan is not configured. Set REACT_APP_STRIPE_PRICE_${planId.toUpperCase()} in your environment.`,
        );
        return;
      }
      setBusyPlanId(planId);
      try {
        const token = await getToken();
        const res = await fetch("/api/stripe/create-checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ priceId: plan.priceId }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error?.message || `HTTP ${res.status}`);
        }
        const { url } = await res.json();
        window.location.href = url;
      } catch (err) {
        setError(err.message);
        setBusyPlanId(null);
      }
    },
    [getToken],
  );

  const cardPlans = PLAN_ORDER.filter((id) => id !== PLAN_IDS.ENTERPRISE).map(
    (id) => PLANS[id],
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white font-heading">
            Simple, usage-based pricing
          </h1>
          <p className="text-gray-400 mt-2">
            Every plan includes the full DNA-enhanced generation pipeline.
            Upgrade any time.
          </p>
        </div>
        {onBack && (
          <Button
            variant="ghost"
            size="md"
            onClick={onBack}
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Back to wizard
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-700 bg-red-900/40 text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cardPlans.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isFree = plan.id === PLAN_IDS.FREE;
          const isBusy = busyPlanId === plan.id;
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card
                variant="elevated"
                padding="lg"
                className={`h-full flex flex-col border ${
                  plan.id === PLAN_IDS.PROFESSIONAL
                    ? "border-royal-500 bg-navy-900/80"
                    : "border-navy-700 bg-navy-950/70"
                }`}
              >
                <div className="mb-4">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-xl font-bold text-white">
                      {plan.name}
                    </h3>
                    {plan.id === PLAN_IDS.PROFESSIONAL && (
                      <span className="text-xs uppercase tracking-wide text-royal-300 bg-royal-900/40 px-2 py-0.5 rounded">
                        Popular
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="text-4xl font-bold text-white">
                      ${plan.priceUsd}
                    </span>
                    <span className="text-gray-400 ml-1">/month</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    {formatLimit(plan.limit)} A1 sheets / month
                  </p>
                </div>

                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start text-sm text-gray-300"
                    >
                      <Check className="w-4 h-4 mr-2 mt-0.5 text-royal-400 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div>
                  {isCurrent ? (
                    <Button
                      variant="ghost"
                      size="md"
                      disabled
                      className="w-full"
                    >
                      Current plan
                    </Button>
                  ) : isFree ? (
                    <Button
                      variant="ghost"
                      size="md"
                      disabled={!isSignedIn}
                      className="w-full"
                    >
                      {isSignedIn ? "Free tier" : "Sign in to start"}
                    </Button>
                  ) : !isSignedIn ? (
                    <SignInButton mode="modal">
                      <Button variant="gradient" size="md" className="w-full">
                        Sign in to subscribe
                      </Button>
                    </SignInButton>
                  ) : (
                    <Button
                      variant={
                        plan.id === PLAN_IDS.PROFESSIONAL
                          ? "gradient"
                          : "primary"
                      }
                      size="md"
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={isBusy}
                      className="w-full"
                    >
                      {isBusy ? "Redirecting…" : `Subscribe to ${plan.name}`}
                    </Button>
                  )}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Card
        variant="elevated"
        padding="lg"
        className="mt-8 border border-navy-700 bg-navy-950/70"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-white">
              Enterprise — ${PLANS[PLAN_IDS.ENTERPRISE].priceUsd}/month
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              Unlimited generations, custom branding, dedicated support. Ideal
              for teams shipping client deliverables daily.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() =>
              (window.location.href = `mailto:sales@archiaisolution.pro?subject=Enterprise%20plan${
                user?.primaryEmailAddress?.emailAddress
                  ? `&body=Hi,%20I'd%20like%20to%20discuss%20an%20Enterprise%20plan%20for%20${encodeURIComponent(
                      user.primaryEmailAddress.emailAddress,
                    )}`
                  : ""
              }`)
            }
          >
            Contact sales
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default PricingPage;
