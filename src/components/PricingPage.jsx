/**
 * PricingPage — subscription plan cards with Stripe Checkout integration.
 *
 * Shows Free, Starter ($29), and Professional ($79) tiers.
 * Each paid card links to Stripe Checkout via /api/stripe/create-checkout.
 */

import React, { useState } from "react";
import PropTypes from "prop-types";
import { motion } from "framer-motion";
import { Check, Zap, Building2, Crown, ArrowLeft } from "lucide-react";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    generations: "2 / month",
    description: "Try ArchiAI with limited generations",
    features: [
      "2 AI generations per month",
      "A1 sheet output",
      "Basic floor plans & elevations",
      "Design history (local)",
    ],
    icon: Zap,
    color: "gray",
    priceEnvKey: null,
    popular: false,
  },
  {
    name: "Starter",
    price: "$29",
    period: "per month",
    generations: "5 / month",
    description: "For freelance architects and small projects",
    features: [
      "5 AI generations per month",
      "A1 sheet output",
      "Full floor plans, elevations & sections",
      "AI Modify with consistency lock",
      "Design history & versioning",
      "Portfolio style blending",
    ],
    icon: Building2,
    color: "blue",
    priceEnvKey: "REACT_APP_STRIPE_PRICE_STARTER",
    popular: false,
  },
  {
    name: "Professional",
    price: "$79",
    period: "per month",
    generations: "20 / month",
    description: "For studios and production workflows",
    features: [
      "20 AI generations per month",
      "Everything in Starter",
      "Priority generation queue",
      "DXF & PDF export",
      "Geometry-first precision mode",
      "Custom site boundary analysis",
      "Email support",
    ],
    icon: Crown,
    color: "purple",
    priceEnvKey: "REACT_APP_STRIPE_PRICE_PROFESSIONAL",
    popular: true,
  },
];

const colorMap = {
  gray: {
    bg: "bg-navy-900/60",
    border: "border-navy-700",
    badge: "bg-gray-700 text-gray-300",
    button: "bg-navy-700 hover:bg-navy-600 text-white",
    icon: "text-gray-400",
  },
  blue: {
    bg: "bg-navy-900/60",
    border: "border-blue-800/50",
    badge: "bg-blue-900 text-blue-300",
    button:
      "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white",
    icon: "text-blue-400",
  },
  purple: {
    bg: "bg-navy-900/80",
    border: "border-purple-700/50",
    badge: "bg-purple-900 text-purple-300",
    button:
      "bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white",
    icon: "text-purple-400",
  },
};

const PricingPage = ({ onBack, currentPlan = "free" }) => {
  const [loadingPlan, setLoadingPlan] = useState(null);

  // Read cached usage
  let usage = null;
  try {
    const cached = sessionStorage.getItem("archiAI_usage");
    if (cached) usage = JSON.parse(cached);
  } catch {
    // ignore
  }

  const handleSubscribe = async (plan) => {
    const priceId = process.env[plan.priceEnvKey];
    if (!priceId) {
      alert("Stripe is not configured. Please set up your Stripe price IDs.");
      return;
    }

    setLoadingPlan(plan.name);

    try {
      // Get the DB user ID from sessionStorage or window global
      let userId = "";
      let email = "";
      try {
        userId = window.__clerkUserId || "";
        email = window.__clerkUserEmail || "";
      } catch {
        // ignore
      }

      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, userId, email }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create checkout");
      }
    } catch (err) {
      alert(`Checkout failed: ${err.message}`);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to design
          </button>
        )}
        <h1 className="text-4xl font-bold text-white mb-3">Choose your plan</h1>
        <p className="text-lg text-gray-400 max-w-xl mx-auto">
          Start free, upgrade when you need more generations. All plans include
          full A1 architectural sheet output.
        </p>
        {usage && (
          <p className="mt-3 text-sm text-gray-500">
            Current usage: {usage.used}/
            {usage.limit === 999999 ? "Unlimited" : usage.limit} generations
            this month
          </p>
        )}
      </div>

      {/* Plan Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan, idx) => {
          const colors = colorMap[plan.color];
          const Icon = plan.icon;
          const isCurrent = currentPlan === plan.name.toLowerCase();
          const isFree = !plan.priceEnvKey;

          return (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`relative rounded-2xl ${colors.bg} border ${colors.border} p-8 flex flex-col ${
                plan.popular ? "ring-2 ring-purple-500/50" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 text-xs font-semibold bg-purple-600 text-white rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <div
                  className={`w-12 h-12 rounded-xl ${colors.badge} flex items-center justify-center mb-4`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-white">
                  {plan.price}
                </span>
                <span className="text-gray-400 ml-2">/{plan.period}</span>
                <p className="text-sm text-gray-500 mt-1">{plan.generations}</p>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => !isFree && !isCurrent && handleSubscribe(plan)}
                disabled={isFree || isCurrent || loadingPlan === plan.name}
                className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                  isCurrent
                    ? "bg-navy-800 text-gray-500 cursor-default"
                    : isFree
                      ? "bg-navy-800 text-gray-400 cursor-default"
                      : colors.button
                } ${loadingPlan === plan.name ? "opacity-70" : ""}`}
              >
                {isCurrent
                  ? "Current Plan"
                  : isFree
                    ? "Free Forever"
                    : loadingPlan === plan.name
                      ? "Redirecting..."
                      : "Subscribe"}
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* FAQ / Note */}
      <p className="text-center text-sm text-gray-500 mt-10">
        All paid plans are billed monthly. Cancel anytime from your account
        settings. Generations reset on the 1st of each month.
      </p>
    </div>
  );
};

PricingPage.propTypes = {
  onBack: PropTypes.func,
  currentPlan: PropTypes.string,
};

export default PricingPage;
