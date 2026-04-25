/**
 * PricingPage — subscription plans UI.
 * Shown as a top-level state-driven view (no router).
 * Triggered from NavBar "Pricing" link or inline upgrade CTA.
 */

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Minus, Zap, ArrowLeft, ChevronDown, Quote } from "lucide-react";
import { PLANS } from "../config/plans.js";
import {
  AuthSignInButton,
  AuthSignedIn,
  AuthSignedOut,
  clerkAuthConfigured,
  useOptionalAuth,
} from "../services/auth/clerkFacade.js";
import ErrorBanner from "./ui/ErrorBanner.jsx";
import { expand } from "../styles/animations.js";

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

// Comparison table: rows = features, cells = per-plan availability.
// Use null for "not included", string for quantitative cell, true for ✓.
const COMPARISON_ROWS = [
  { label: "A1 sheets / month", values: ["2", "5", "20", "Unlimited"] },
  {
    label: "DNA-Enhanced pipeline",
    values: [true, true, true, true],
  },
  {
    label: "All export formats (PDF / DXF / IFC)",
    values: [null, true, true, true],
  },
  { label: "AI Modify workflow", values: [null, null, true, true] },
  { label: "Priority support", values: [null, true, true, true] },
  { label: "Dedicated support", values: [null, null, null, true] },
  { label: "Custom integrations", values: [null, null, null, true] },
];

const FAQ = [
  {
    q: "How many A1 sheets can I generate per month?",
    a: "Each plan includes a monthly quota — 2 on Free, 5 on Starter, 20 on Professional, and unlimited on Enterprise. Quotas reset on your billing date.",
  },
  {
    q: "What happens to my designs if I cancel?",
    a: "Your designs are stored locally in your browser (with optional Supabase sync) and remain available after cancellation. Generation is paused until you re-subscribe.",
  },
  {
    q: "Can I switch plans?",
    a: "Yes — upgrade or downgrade anytime from your account dashboard. Stripe handles proration automatically and the change takes effect immediately.",
  },
];

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
      className={`relative flex flex-col rounded-2xl border p-6 transition-colors ${
        isPopular
          ? "border-royal-500 bg-navy-900/80 shadow-glow"
          : "border-white/10 bg-navy-900/50 hover:border-white/20"
      }`}
    >
      {isPopular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-royal-500 text-white text-xs font-bold px-3 py-1 rounded-full">
          Most Popular
        </span>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold text-white">{plan.label}</h3>
        <p className="text-sm text-white/55 mt-1">{plan.description}</p>
      </div>

      <div className="mb-6">
        {isFree ? (
          <span className="text-4xl font-extrabold text-white">Free</span>
        ) : (
          <span className="text-4xl font-extrabold text-white tabular-nums">
            ${plan.price}
            <span className="text-base font-normal text-white/55">/mo</span>
          </span>
        )}
      </div>

      <ul className="space-y-2 mb-8 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-white/75">
            <Check
              className="w-4 h-4 text-royal-300 flex-shrink-0 mt-0.5"
              strokeWidth={2}
            />
            {f}
          </li>
        ))}
      </ul>

      <AuthSignedIn>
        {!clerkAuthConfigured && !isFree ? (
          <a
            href="mailto:hello@archiaisolution.pro?subject=Subscription Access"
            className="block w-full text-center py-2 rounded-lg text-sm font-medium bg-white/5 text-white/85 hover:bg-white/10 border border-white/10 transition-colors"
          >
            Contact us
          </a>
        ) : isFree ? (
          <button
            disabled
            className="w-full py-2 rounded-lg text-sm font-medium bg-white/5 text-white/40 cursor-default border border-white/10"
          >
            Current free plan
          </button>
        ) : isEnterprise ? (
          <a
            href="mailto:hello@archiaisolution.pro?subject=Enterprise Plan"
            className="block w-full text-center py-2 rounded-lg text-sm font-medium bg-white/5 text-white/85 hover:bg-white/10 border border-white/10 transition-colors"
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
                : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
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

const ComparisonCell = ({ value }) => {
  if (value === true) {
    return (
      <Check
        className="mx-auto h-4 w-4 text-emerald-300"
        strokeWidth={2}
        aria-label="Included"
      />
    );
  }
  if (value === null || value === undefined) {
    return (
      <Minus
        className="mx-auto h-4 w-4 text-white/25"
        strokeWidth={1.5}
        aria-label="Not included"
      />
    );
  }
  return <span className="text-sm text-white/85 tabular-nums">{value}</span>;
};

const ComparisonTable = () => {
  const planLabels = PLAN_ORDER.map((key) => PLANS[key].label);

  return (
    <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <h3 className="text-eyebrow px-6 pt-5 pb-3">Plan Comparison</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-widest text-white/55">
                Feature
              </th>
              {planLabels.map((label, i) => (
                <th
                  key={label}
                  className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest ${
                    i === 2 ? "text-royal-300" : "text-white/70"
                  }`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row, idx) => (
              <tr
                key={row.label}
                className={`border-b border-white/[0.06] ${
                  idx % 2 === 0 ? "bg-white/[0.01]" : ""
                }`}
              >
                <td className="px-6 py-3 text-sm text-white/80">{row.label}</td>
                {row.values.map((v, i) => (
                  <td key={i} className="px-4 py-3 text-center">
                    <ComparisonCell value={v} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const FAQItem = ({ q, a, isOpen, onToggle }) => {
  return (
    <div className="border-b border-white/8 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-4 text-left text-base font-medium text-white/85 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-royal-500/30 rounded-md"
        aria-expanded={isOpen}
      >
        <span>{q}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-4 flex-shrink-0"
        >
          <ChevronDown className="h-5 w-5 text-white/55" strokeWidth={1.75} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            variants={expand}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden"
          >
            <p className="pb-4 text-sm text-white/65 leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FaqSection = () => {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-2">
      <h3 className="text-eyebrow pt-3 pb-2">Frequently Asked</h3>
      {FAQ.map((item, idx) => (
        <FAQItem
          key={item.q}
          q={item.q}
          a={item.a}
          isOpen={openIndex === idx}
          onToggle={() => setOpenIndex(openIndex === idx ? -1 : idx)}
        />
      ))}
    </div>
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
            className="flex items-center gap-2 text-white/55 hover:text-white mb-8 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back to wizard
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-12">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-extrabold text-white mb-3"
            style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
          >
            Simple, transparent pricing
          </motion.h1>
          <p className="text-white/65 text-lg">
            Generate professional RIBA-standard A1 architectural sheets with AI.
          </p>
        </div>

        {/* Error */}
        <div className="mb-6">
          <ErrorBanner
            variant="error"
            message={error}
            visible={!!error}
            onDismiss={() => setError(null)}
          />
        </div>

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

        {/* Comparison table */}
        <ComparisonTable />

        {/* FAQ accordion */}
        <FaqSection />

        {/* Social proof + footer note */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-white/65">
            <Quote className="h-4 w-4 text-royal-300" strokeWidth={1.75} />
            Trusted by architects across the UK
          </div>
          <p className="text-center text-xs text-white/45 mt-4">
            Prices in USD. Cancel anytime. Stripe handles all billing securely.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
