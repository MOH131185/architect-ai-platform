/**
 * Landing Page — Pro-Level Dark Blueprint Surface
 *
 * Single canonical h1, tight motion timing, Tailwind utility classes,
 * shared Button + Card primitives. No inline style props or JS hover handlers.
 */

import React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Zap,
  Shield,
  Building2,
  MapPin,
  FileText,
  Sparkles,
  Eye,
  Layers,
  Target,
  Rocket,
  Download,
} from "lucide-react";
import CompanyLogo from "./ui/CompanyLogo.jsx";
import AnimatedBlueprintLogo from "./ui/AnimatedBlueprintLogo.jsx";
import Button from "./ui/Button.jsx";
import Card from "./ui/Card.jsx";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

const features = [
  {
    icon: Zap,
    title: "60-second generation",
    description:
      "Generate professional UK RIBA-standard A1 architectural sheets in under a minute.",
  },
  {
    icon: Shield,
    title: "98% consistency",
    description:
      "Industry-leading cross-view consistency through our Design DNA system.",
  },
  {
    icon: Building2,
    title: "Climate-aware",
    description:
      "Automatic climate analysis and site-specific design adaptations baked in.",
  },
  {
    icon: FileText,
    title: "UK RIBA standards",
    description:
      "Professional A1 sheets with complete title blocks and ARB compliance.",
  },
];

const trustPoints = [
  "UK RIBA Compliant",
  "98% Consistency",
  "60s Generation",
  "Climate Intelligence",
];

const workflowSteps = [
  { icon: MapPin, title: "Location", desc: "Set site location" },
  { icon: Sparkles, title: "Intelligence", desc: "Climate analysis" },
  { icon: FileText, title: "Portfolio", desc: "Upload references" },
  { icon: Sparkles, title: "Generate", desc: "AI creates design" },
  { icon: Download, title: "Export", desc: "Download A1 sheet" },
];

const roadmap = [
  {
    icon: Target,
    title: "Working today",
    accent: "text-success-300",
    accentSurface: "bg-success-500/10 border-success-500/25",
    items: [
      "Multi-panel A1 architectural sheets",
      "Design DNA consistency system (98%+)",
      "SVG + FLUX hybrid rendering",
      "Climate-aware site analysis",
      "AI-powered floor plan layout",
    ],
  },
  {
    icon: Layers,
    title: "In development",
    accent: "text-royal-300",
    accentSurface: "bg-royal-500/10 border-royal-500/25",
    items: [
      "Deterministic geometry pipeline",
      "ControlNet-locked renders",
      "Enhanced CAD/BIM export",
      "Portfolio-trained style models",
    ],
  },
  {
    icon: Rocket,
    title: "On the horizon",
    accent: "text-info-300",
    accentSurface: "bg-info-500/10 border-info-500/25",
    items: [
      "Real-time design collaboration",
      "Multi-building campus design",
      "Regulatory compliance AI",
      "Full BIM automation",
    ],
  },
];

const NavLink = ({ href, children }) => (
  <a
    href={href}
    className="text-sm text-white/60 transition-colors hover:text-white/95 focus-visible:outline-none focus-visible:text-white"
  >
    {children}
  </a>
);

const LandingPage = ({ onStart, onDemo, historyControl = null }) => {
  return (
    <div className="relative min-h-screen bg-navy-950 text-white">
      {/* Subtle blueprint grid — single layer, low contrast */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(37,99,235,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.05) 1px, transparent 1px), linear-gradient(rgba(37,99,235,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px, 24px 24px, 120px 120px, 120px 120px",
        }}
      />

      {/* Vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, transparent 45%, rgba(10,14,39,0.55) 100%)",
        }}
      />

      {/* Navigation */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/8 bg-navy-950/85 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <CompanyLogo size={44} />
            <div>
              <div className="text-base font-semibold text-white/95 tracking-tight">
                ArchiAI Solution
              </div>
              <div className="text-xs text-white/55">
                AI for Architecture &amp; Design
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            <NavLink href="#features">Features</NavLink>
            <NavLink href="#how-it-works">How it works</NavLink>
            <NavLink href="#technology">Technology</NavLink>
          </div>

          <div className="flex items-center gap-3">
            {historyControl}
            <button
              type="button"
              onClick={onDemo}
              className="hidden text-sm text-white/65 transition-colors hover:text-white/95 sm:inline"
            >
              View demo
            </button>
            <Button variant="primary" size="sm" onClick={onStart}>
              Start designing
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-6 pb-24 pt-36 sm:pt-40">
        <div className="container relative z-10 mx-auto max-w-5xl text-center">
          <motion.div
            className="mb-8 flex justify-center"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <AnimatedBlueprintLogo
              size={120}
              showBackground={true}
              autoPlay={true}
            />
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-royal-500/25 bg-royal-500/10 px-3.5 py-1.5"
          >
            <Sparkles
              className="h-3.5 w-3.5 text-royal-300"
              strokeWidth={1.75}
            />
            <span className="text-xs font-medium text-royal-200">
              Meet ArchiAI — AI-powered architectural design
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.6, delay: 0.15 }}
            className="text-display-md md:text-display-lg lg:text-display-xl mx-auto mb-6 max-w-4xl text-balance text-white"
          >
            <span className="block">AI-generated architectural</span>
            <span className="block bg-gradient-to-r from-royal-300 via-info-300 to-royal-300 bg-clip-text text-transparent">
              drawings in minutes
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-white/65"
          >
            From site brief to professional A1 sheets — floor plans, elevations,
            sections, and 3D views with 98% cross-view consistency. Powered by
            Design DNA.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button
              variant="primary"
              size="lg"
              onClick={onStart}
              icon={<ArrowRight className="h-5 w-5" />}
              iconPosition="right"
              className="min-w-[200px] shadow-glow-brand"
            >
              Start designing
            </Button>
            <Button
              variant="subtle"
              size="lg"
              onClick={onDemo}
              icon={<Eye className="h-5 w-5" />}
              className="min-w-[200px]"
            >
              See live example
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-2.5"
          >
            {trustPoints.map((point, index) => (
              <motion.div
                key={point}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.55 + index * 0.05 }}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm"
              >
                <Check className="h-3 w-3 text-royal-300" strokeWidth={2.25} />
                <span className="text-xs font-medium tabular-nums text-white/85">
                  {point}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        className="relative bg-navy-900/60 px-6 py-24 backdrop-blur-sm"
      >
        <div className="container mx-auto max-w-6xl">
          <motion.div
            variants={fadeUp}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="mb-16 text-center"
          >
            <p className="text-eyebrow mb-3">Why ArchiAI</p>
            <h2 className="text-display-sm md:text-display-md mb-4 text-balance text-white">
              Built for architectural professionals
            </h2>
            <p className="mx-auto max-w-2xl text-base text-white/65">
              Professional-grade AI generation with Design DNA consistency,
              climate intelligence, and UK RIBA-standard output.
            </p>
          </motion.div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
              >
                <Card
                  variant="glass"
                  padding="lg"
                  interactive
                  className="h-full"
                >
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-royal-500/25 bg-royal-500/10">
                    <feature.icon
                      className="h-5 w-5 text-royal-300"
                      strokeWidth={1.75}
                    />
                  </div>
                  <h3 className="mb-2 text-base font-semibold tracking-tight text-white">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-white/60">
                    {feature.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative px-6 py-24">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            variants={fadeUp}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="mb-16 text-center"
          >
            <p className="text-eyebrow mb-3">How it works</p>
            <h2 className="text-display-sm md:text-display-md mb-4 text-balance text-white">
              A single, unified architecture AI API
            </h2>
            <p className="mx-auto max-w-3xl text-base text-white/65">
              Instead of stitching together separate components, ArchiAI unifies
              site analysis, design generation, and AI reasoning into a single
              API — reducing complexity, latency, and cost.
            </p>
          </motion.div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute left-[10%] right-[10%] top-8 hidden h-px bg-gradient-to-r from-transparent via-royal-500/30 to-transparent md:block"
            />

            <div className="grid gap-6 md:grid-cols-5">
              {workflowSteps.map((step, index) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: index * 0.07 }}
                  className="relative text-center"
                >
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-royal-500/25 bg-navy-950 backdrop-blur-sm">
                    <step.icon
                      className="h-6 w-6 text-royal-300"
                      strokeWidth={1.75}
                    />
                  </div>
                  <div className="mb-1 text-sm font-semibold text-white/95">
                    {step.title}
                  </div>
                  <div className="text-xs text-white/55">{step.desc}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Technology Roadmap */}
      <section
        id="technology"
        className="relative bg-navy-900/60 px-6 py-24 backdrop-blur-sm"
      >
        <div className="container mx-auto max-w-6xl">
          <motion.div
            variants={fadeUp}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="mb-16 text-center"
          >
            <p className="text-eyebrow mb-3">Technology roadmap</p>
            <h2 className="text-display-sm md:text-display-md mb-4 text-balance text-white">
              From working MVP to production grade
            </h2>
            <p className="mx-auto max-w-2xl text-base text-white/65">
              A clear path from working MVP to production-grade architectural
              AI.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {roadmap.map((phase, index) => (
              <motion.div
                key={phase.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
              >
                <Card
                  variant="glass"
                  padding="lg"
                  interactive
                  className="h-full"
                >
                  <div
                    className={`mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border ${phase.accentSurface}`}
                  >
                    <phase.icon
                      className={`h-5 w-5 ${phase.accent}`}
                      strokeWidth={1.75}
                    />
                  </div>
                  <h3 className="mb-4 text-lg font-semibold tracking-tight text-white">
                    {phase.title}
                  </h3>
                  <ul className="space-y-2.5">
                    {phase.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2.5 text-sm leading-relaxed text-white/70"
                      >
                        <Check
                          className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${phase.accent}`}
                          strokeWidth={2}
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative px-6 py-24">
        <div className="container mx-auto max-w-3xl text-center">
          <motion.div
            variants={fadeUp}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-display-sm md:text-display-md mb-5 text-balance text-white">
              Ready to see AI-powered architecture?
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-base text-white/65">
              Generate professional A1 architectural sheets with floor plans,
              elevations, sections, and 3D views — all from a single brief.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                variant="primary"
                size="lg"
                onClick={onStart}
                icon={<ArrowRight className="h-5 w-5" />}
                iconPosition="right"
                className="min-w-[200px] shadow-glow-brand"
              >
                Start designing
              </Button>
              <Button
                variant="subtle"
                size="lg"
                onClick={onDemo}
                icon={<Eye className="h-5 w-5" />}
                className="min-w-[200px]"
              >
                See live example
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/8 px-6 py-10">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-3">
              <CompanyLogo size={32} className="opacity-70" />
              <div>
                <div className="text-sm font-semibold text-white/85">
                  ArchiAI Solution Ltd.
                </div>
                <div className="text-xs text-white/45">
                  AI for Architecture &amp; Design
                </div>
              </div>
            </div>

            <nav
              aria-label="Footer"
              className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
            >
              {["Documentation", "API Reference", "Support", "Privacy"].map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    className="text-white/55 transition-colors hover:text-white/90"
                  >
                    {item}
                  </button>
                ),
              )}
            </nav>

            <div className="text-xs text-white/40">
              &copy; {new Date().getFullYear()} ArchiAI Solution Ltd.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
