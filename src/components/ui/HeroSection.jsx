/**
 * HeroSection - Blueprint Architectural Theme
 *
 * Premium hero landing section with blueprint-inspired styling.
 * Dark navy, subtle grid, professional architectural tone.
 */

import React from "react";
import { Sparkles, ArrowRight, Play } from "lucide-react";
import CompanyLogo from "./CompanyLogo.jsx";

export const HeroSection = ({ onStartDemo, onTryDemo }) => {
  return (
    <section
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: "#0a0e27" }}
    >
      {/* Blueprint Grid Background */}
      <div
        className="absolute inset-0 pointer-events-none"
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
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(10, 14, 39, 0.5) 100%)",
        }}
      />

      {/* Main Content */}
      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center items-center mb-8">
            <div className="relative">
              <CompanyLogo
                alt="ARCHIAI SOLUTION Logo"
                className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28"
              />
              <div
                className="absolute inset-0 rounded-full -z-10"
                style={{
                  background:
                    "radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, transparent 70%)",
                  transform: "scale(1.5)",
                }}
              />
            </div>
          </div>

          {/* Title */}
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              color: "rgba(255, 255, 255, 0.95)",
              letterSpacing: "-0.02em",
            }}
          >
            ARCHIAI SOLUTION
          </h1>

          {/* Subtitle */}
          <p
            className="text-lg sm:text-xl md:text-2xl max-w-4xl mx-auto mb-4"
            style={{ color: "rgba(255, 255, 255, 0.75)" }}
          >
            The First AI Company for Architects & Construction Engineers
          </p>

          {/* Description */}
          <p
            className="text-base sm:text-lg md:text-xl max-w-3xl mx-auto mb-12"
            style={{ color: "rgba(255, 255, 255, 0.55)" }}
          >
            Transform any location into intelligent architectural designs in
            minutes, not months. AI-powered design generation with full
            technical documentation.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <button
              onClick={onStartDemo}
              className="group px-8 py-4 rounded-xl text-base font-semibold transition-all flex items-center"
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                border: "1px solid rgba(96, 165, 250, 0.3)",
                boxShadow: "0 4px 20px rgba(37, 99, 235, 0.25)",
                color: "white",
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
              <Sparkles className="w-5 h-5 mr-2" />
              <span>Start Project</span>
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={onTryDemo}
              className="group px-8 py-4 rounded-xl text-base font-medium transition-all flex items-center"
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
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
              }}
            >
              <Play className="w-5 h-5 mr-2" />
              <span>Try Demo</span>
            </button>
          </div>

          {/* Trust Indicators */}
          <p style={{ color: "rgba(255, 255, 255, 0.5)" }}>
            No login required · 5-minute walkthrough · Free to try
          </p>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div
          className="w-6 h-10 rounded-full flex items-start justify-center p-2"
          style={{ border: "2px solid rgba(255, 255, 255, 0.2)" }}
        >
          <div
            className="w-1 h-3 rounded-full animate-bounce"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.4)" }}
          />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
