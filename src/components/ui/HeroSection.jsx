import React from 'react';
import { Sparkles, ArrowRight, Play } from 'lucide-react';
import GlassButton from './GlassButton.jsx';

/**
 * HeroSection - Premium hero landing section with liquid glass
 */
export const HeroSection = ({ onStartDemo, onTryDemo }) => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Layers */}
      <div className="animated-bg" />
      <div className="architecture-bg" />

      {/* Floating Glass Orbs */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-float animate-pulse" />
      <div className="absolute bottom-20 right-10 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-3xl animate-float animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl animate-float animate-pulse" style={{ animationDelay: '4s' }} />

      {/* Main Content */}
      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center animate-fadeInUp">
          {/* Logo */}
          <div className="flex justify-center items-center mb-8">
            <div className="relative">
              <img
                src="/logo/logo.png"
                alt="ARCHIAI SOLUTION Logo"
                className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 logo-float"
                style={{ filter: 'drop-shadow(0 0 20px rgba(0, 122, 255, 0.5))' }}
              />
              <div className="absolute inset-0 bg-blue-500/30 rounded-full blur-xl -z-10 animate-pulse" />
            </div>
          </div>

          {/* Title */}
          <h1 className="premium-title text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-6">
            ARCHIAI SOLUTION
          </h1>

          {/* Subtitle */}
          <p className="premium-subtitle text-xl sm:text-2xl md:text-3xl max-w-4xl mx-auto mb-4">
            The First AI Company for Architects & Construction Engineers
          </p>

          {/* Description */}
          <p className="text-base sm:text-lg md:text-xl text-white/70 max-w-3xl mx-auto mb-12">
            Transform any location into intelligent architectural designs in minutes, not months.
            AI-powered design generation with full technical documentation.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <GlassButton
              variant="primary"
              size="lg"
              onClick={onStartDemo}
              className="group"
            >
              <Sparkles className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" />
              <span>Start Project</span>
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </GlassButton>

            <GlassButton
              variant="secondary"
              size="lg"
              onClick={onTryDemo}
              className="group"
            >
              <Play className="w-5 h-5 mr-2" />
              <span>Try Demo</span>
            </GlassButton>
          </div>

          {/* Trust Indicators */}
          <p className="text-sm sm:text-base text-white/60">
            No login required • 5-minute walkthrough • Free to try
          </p>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center p-2">
          <div className="w-1 h-3 bg-white/50 rounded-full" />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

