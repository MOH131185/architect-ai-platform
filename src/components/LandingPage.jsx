/**
 * Landing Page - Blueprint Architectural Theme
 *
 * Visually homogeneous with the app page (Location Analysis).
 * Dark navy, blueprint grid, low saturation, professional architectural tone.
 * NO bright gradients, NO flashy glow, NO SaaS neon aesthetics.
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
  Play,
  Code,
  Globe,
  Lock,
  Download,
} from "lucide-react";
import CompanyLogo from "./ui/CompanyLogo.jsx";
import AnimatedBlueprintLogo from "./ui/AnimatedBlueprintLogo.jsx";
import "../styles/design-tokens.css";

const LandingPage = ({ onStart }) => {
  // Features data
  const features = [
    {
      icon: Zap,
      title: "60 Second Generation",
      description:
        "Generate professional UK RIBA-standard A1 architectural sheets in under a minute.",
    },
    {
      icon: Shield,
      title: "98% Consistency",
      description:
        "Industry-leading cross-view consistency with our Design DNA system.",
    },
    {
      icon: Building2,
      title: "Climate-Aware",
      description:
        "Automatic climate analysis and site-specific design adaptations.",
    },
    {
      icon: FileText,
      title: "UK RIBA Standards",
      description:
        "Professional A1 sheets with complete title blocks and ARB compliance.",
    },
  ];

  // Trust indicators
  const trustPoints = [
    "UK RIBA Compliant",
    "98% Consistency",
    "60s Generation",
    "Climate Intelligence",
  ];

  // Workflow steps
  const workflowSteps = [
    { icon: MapPin, title: "Location", desc: "Set site location" },
    { icon: Sparkles, title: "Intelligence", desc: "Climate analysis" },
    { icon: FileText, title: "Portfolio", desc: "Upload references" },
    { icon: Code, title: "Generate", desc: "AI creates design" },
    { icon: Download, title: "Export", desc: "Download A1 sheet" },
  ];

  // Solutions data
  const solutions = [
    {
      icon: Building2,
      title: "Build with APIs",
      desc: "Architecture AI Infrastructure for Builders",
    },
    {
      icon: Globe,
      title: "Integrate ArchiAI",
      desc: "Architecture AI for Platforms & Partners",
    },
    {
      icon: Lock,
      title: "Custom Models",
      desc: "Architecture AI Solutions Built with You",
    },
  ];

  return (
    <div
      className="min-h-screen text-white relative"
      style={{ backgroundColor: "#0a0e27" }}
    >
      {/* Blueprint Grid Background - Very Subtle */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(37, 99, 235, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(37, 99, 235, 0.04) 1px, transparent 1px),
            linear-gradient(rgba(37, 99, 235, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(37, 99, 235, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px, 20px 20px, 100px 100px, 100px 100px",
        }}
      />

      {/* Vignette Overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(10, 14, 39, 0.5) 100%)",
        }}
      />

      {/* Navigation */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl"
        style={{
          backgroundColor: "rgba(10, 14, 39, 0.85)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CompanyLogo size={48} className="mr-2" />
              <div>
                <div
                  className="text-lg font-semibold"
                  style={{ color: "rgba(255, 255, 255, 0.95)" }}
                >
                  ArchiAI Solution
                </div>
                <div
                  className="text-xs"
                  style={{ color: "rgba(255, 255, 255, 0.55)" }}
                >
                  AI for Architecture & Design
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-sm transition-colors"
                style={{ color: "rgba(255, 255, 255, 0.6)" }}
                onMouseOver={(e) =>
                  (e.target.style.color = "rgba(255, 255, 255, 0.95)")
                }
                onMouseOut={(e) =>
                  (e.target.style.color = "rgba(255, 255, 255, 0.6)")
                }
              >
                Features
              </a>
              <a
                href="#how-it-works"
                className="text-sm transition-colors"
                style={{ color: "rgba(255, 255, 255, 0.6)" }}
                onMouseOver={(e) =>
                  (e.target.style.color = "rgba(255, 255, 255, 0.95)")
                }
                onMouseOut={(e) =>
                  (e.target.style.color = "rgba(255, 255, 255, 0.6)")
                }
              >
                How It Works
              </a>
              <a
                href="#pricing"
                className="text-sm transition-colors"
                style={{ color: "rgba(255, 255, 255, 0.6)" }}
                onMouseOver={(e) =>
                  (e.target.style.color = "rgba(255, 255, 255, 0.95)")
                }
                onMouseOut={(e) =>
                  (e.target.style.color = "rgba(255, 255, 255, 0.6)")
                }
              >
                Pricing
              </a>
            </div>
            <div className="flex items-center gap-4">
              <button
                className="text-sm transition-colors"
                style={{ color: "rgba(255, 255, 255, 0.6)" }}
                onMouseOver={(e) =>
                  (e.target.style.color = "rgba(255, 255, 255, 0.95)")
                }
                onMouseOut={(e) =>
                  (e.target.style.color = "rgba(255, 255, 255, 0.6)")
                }
              >
                Log In
              </button>
              <button
                onClick={onStart}
                className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background:
                    "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                  border: "1px solid rgba(96, 165, 250, 0.3)",
                  boxShadow: "0 4px 16px rgba(37, 99, 235, 0.2)",
                }}
                onMouseOver={(e) => {
                  e.target.style.background =
                    "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)";
                  e.target.style.transform = "translateY(-1px)";
                }}
                onMouseOut={(e) => {
                  e.target.style.background =
                    "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)";
                  e.target.style.transform = "translateY(0)";
                }}
              >
                Sign Up Free
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="text-center mb-12">
            {/* Animated Blueprint Logo */}
            <div className="flex justify-center mb-8">
              <AnimatedBlueprintLogo
                size={120}
                showBackground={true}
                autoPlay={true}
              />
            </div>

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.8 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
              style={{
                backgroundColor: "rgba(37, 99, 235, 0.1)",
                border: "1px solid rgba(37, 99, 235, 0.2)",
              }}
            >
              <Sparkles className="w-4 h-4" style={{ color: "#60a5fa" }} />
              <span className="text-sm" style={{ color: "#93c5fd" }}>
                Meet ArchiAI - AI-powered architectural design
              </span>
            </motion.div>

            {/* Main Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.6 }}
              className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight tracking-tight"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                color: "rgba(255, 255, 255, 0.95)",
              }}
            >
              <span className="block">Architecture AI APIs</span>
              <span
                className="block"
                style={{
                  background:
                    "linear-gradient(135deg, #60a5fa 0%, #93c5fd 50%, #60a5fa 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                that just work
              </span>
            </motion.h1>

            {/* Subheading */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.7, duration: 0.5 }}
              className="text-lg md:text-xl mb-12 max-w-3xl mx-auto leading-relaxed"
              style={{ color: "rgba(255, 255, 255, 0.65)" }}
            >
              Build with the most accurate, realistic, and cost-effective APIs
              for architectural design generation. Trusted by architects and
              leading firms. Available in real-time and batch, cloud and
              self-hosted.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.9, duration: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
            >
              <button
                onClick={onStart}
                className="group px-8 py-4 rounded-xl text-base font-semibold transition-all flex items-center min-w-[200px] justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                  border: "1px solid rgba(96, 165, 250, 0.3)",
                  boxShadow: "0 4px 20px rgba(37, 99, 235, 0.25)",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 8px 28px rgba(37, 99, 235, 0.35)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 20px rgba(37, 99, 235, 0.25)";
                }}
              >
                Sign Up Free
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                className="group px-8 py-4 rounded-xl text-base font-medium transition-all flex items-center min-w-[200px] justify-center"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "rgba(255, 255, 255, 0.85)",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.08)";
                  e.currentTarget.style.borderColor = "rgba(96, 165, 250, 0.4)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor =
                    "rgba(255, 255, 255, 0.15)";
                }}
              >
                <Play className="w-5 h-5 mr-2" />
                Playground
              </button>
            </motion.div>

            {/* Trust Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.1, duration: 0.5 }}
              className="flex flex-wrap items-center justify-center gap-8 text-sm"
              style={{ color: "rgba(255, 255, 255, 0.55)" }}
            >
              {trustPoints.map((point, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Check className="w-4 h-4" style={{ color: "#60a5fa" }} />
                  <span>{point}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section
        id="features"
        className="py-20 px-6"
        style={{ backgroundColor: "#0f172a" }}
      >
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                color: "rgba(255, 255, 255, 0.95)",
              }}
            >
              Choose your Architecture AI journey
            </h2>
            <p
              className="text-lg max-w-2xl mx-auto"
              style={{ color: "rgba(255, 255, 255, 0.6)" }}
            >
              Choose the path that best fits your business needs and technical
              requirements.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-2xl transition-all duration-300 group"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(12px)",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.06)";
                  e.currentTarget.style.borderColor = "rgba(37, 99, 235, 0.3)";
                  e.currentTarget.style.transform = "translateY(-4px)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.04)";
                  e.currentTarget.style.borderColor =
                    "rgba(255, 255, 255, 0.08)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors"
                  style={{
                    backgroundColor: "rgba(37, 99, 235, 0.1)",
                    border: "1px solid rgba(37, 99, 235, 0.2)",
                  }}
                >
                  <feature.icon
                    className="w-6 h-6"
                    style={{ color: "#60a5fa" }}
                  />
                </div>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ color: "rgba(255, 255, 255, 0.95)" }}
                >
                  {feature.title}
                </h3>
                <p style={{ color: "rgba(255, 255, 255, 0.6)" }}>
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="py-20 px-6"
        style={{ backgroundColor: "#0a0e27" }}
      >
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                color: "rgba(255, 255, 255, 0.95)",
              }}
            >
              A single, unified Architecture AI API
            </h2>
            <p
              className="text-lg max-w-3xl mx-auto"
              style={{ color: "rgba(255, 255, 255, 0.6)" }}
            >
              Instead of stitching together separate components, ArchiAI unifies
              site analysis, design generation, and AI reasoning into a single
              API, reducing complexity, latency, and cost.
            </p>
          </motion.div>

          {/* Workflow Diagram */}
          <div className="relative">
            <div className="grid md:grid-cols-5 gap-6">
              {workflowSteps.map((step, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center"
                >
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4"
                    style={{
                      backgroundColor: "rgba(37, 99, 235, 0.1)",
                      border: "1px solid rgba(37, 99, 235, 0.25)",
                    }}
                  >
                    <step.icon
                      className="w-6 h-6"
                      style={{ color: "#60a5fa" }}
                    />
                  </div>
                  <h3
                    className="font-semibold mb-1"
                    style={{ color: "rgba(255, 255, 255, 0.9)" }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-sm"
                    style={{ color: "rgba(255, 255, 255, 0.55)" }}
                  >
                    {step.desc}
                  </p>
                </motion.div>
              ))}
            </div>
            {/* Connection line */}
            <div
              className="hidden md:block absolute top-8 left-[10%] right-[10%] h-px"
              style={{ backgroundColor: "rgba(37, 99, 235, 0.2)" }}
            />
          </div>
        </div>
      </section>

      {/* Solutions Section */}
      <section className="py-20 px-6" style={{ backgroundColor: "#0f172a" }}>
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                color: "rgba(255, 255, 255, 0.95)",
              }}
            >
              Solutions that scale
            </h2>
            <p
              className="text-lg max-w-2xl mx-auto"
              style={{ color: "rgba(255, 255, 255, 0.6)" }}
            >
              As the industry's architecture AI leader, ArchiAI drives better
              outcomes with enterprise solutions that deliver intelligent design
              experiences safely, securely, and at scale.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {solutions.map((solution, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-2xl transition-all duration-300"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  backdropFilter: "blur(12px)",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.06)";
                  e.currentTarget.style.borderColor = "rgba(37, 99, 235, 0.3)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.04)";
                  e.currentTarget.style.borderColor =
                    "rgba(255, 255, 255, 0.08)";
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    backgroundColor: "rgba(37, 99, 235, 0.1)",
                    border: "1px solid rgba(37, 99, 235, 0.2)",
                  }}
                >
                  <solution.icon
                    className="w-6 h-6"
                    style={{ color: "#60a5fa" }}
                  />
                </div>
                <h3
                  className="text-xl font-semibold mb-2"
                  style={{ color: "rgba(255, 255, 255, 0.95)" }}
                >
                  {solution.title}
                </h3>
                <p
                  className="mb-4"
                  style={{ color: "rgba(255, 255, 255, 0.6)" }}
                >
                  {solution.desc}
                </p>
                <button
                  className="flex items-center gap-2 transition-colors"
                  style={{ color: "#60a5fa" }}
                  onMouseOver={(e) => (e.currentTarget.style.color = "#93c5fd")}
                  onMouseOut={(e) => (e.currentTarget.style.color = "#60a5fa")}
                >
                  Learn more <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section
        className="py-20 px-6"
        style={{
          background: "linear-gradient(180deg, #0a0e27 0%, #0f172a 100%)",
        }}
      >
        <div className="container mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2
              className="text-3xl md:text-4xl font-bold mb-6"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                color: "rgba(255, 255, 255, 0.95)",
              }}
            >
              Unlock architecture AI at scale with an API Call
            </h2>
            <p
              className="text-lg mb-8 max-w-2xl mx-auto"
              style={{ color: "rgba(255, 255, 255, 0.6)" }}
            >
              Get intelligent design generation with analysis and understanding
              on the world's best architecture AI platform.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onStart}
                className="px-8 py-4 rounded-xl text-base font-semibold transition-all min-w-[200px]"
                style={{
                  background:
                    "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                  border: "1px solid rgba(96, 165, 250, 0.3)",
                  boxShadow: "0 4px 20px rgba(37, 99, 235, 0.25)",
                }}
                onMouseOver={(e) => {
                  e.target.style.background =
                    "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)";
                  e.target.style.transform = "translateY(-2px)";
                }}
                onMouseOut={(e) => {
                  e.target.style.background =
                    "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)";
                  e.target.style.transform = "translateY(0)";
                }}
              >
                Sign Up Free
              </button>
              <button
                className="px-8 py-4 rounded-xl text-base font-medium transition-all min-w-[200px]"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "rgba(255, 255, 255, 0.85)",
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                  e.target.style.borderColor = "rgba(96, 165, 250, 0.4)";
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
                  e.target.style.borderColor = "rgba(255, 255, 255, 0.15)";
                }}
              >
                Get a Demo
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-12 px-6"
        style={{
          backgroundColor: "#0a0e27",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <CompanyLogo size={36} className="mr-2 opacity-70" />
              <div>
                <div
                  className="text-sm font-semibold"
                  style={{ color: "rgba(255, 255, 255, 0.8)" }}
                >
                  ArchiAI Solution Ltd.
                </div>
                <div
                  className="text-xs"
                  style={{ color: "rgba(255, 255, 255, 0.45)" }}
                >
                  AI for Architecture & Design
                </div>
              </div>
            </div>
            <div
              className="flex flex-wrap items-center gap-6 text-sm"
              style={{ color: "rgba(255, 255, 255, 0.55)" }}
            >
              {["Documentation", "API Reference", "Support", "Privacy"].map(
                (item) => (
                  <a
                    key={item}
                    href="#"
                    className="transition-colors"
                    onMouseOver={(e) =>
                      (e.target.style.color = "rgba(255, 255, 255, 0.9)")
                    }
                    onMouseOut={(e) =>
                      (e.target.style.color = "rgba(255, 255, 255, 0.55)")
                    }
                  >
                    {item}
                  </a>
                ),
              )}
            </div>
            <div
              className="text-sm"
              style={{ color: "rgba(255, 255, 255, 0.4)" }}
            >
              &copy; {new Date().getFullYear()} ArchiAI Solution Ltd. All rights
              reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
