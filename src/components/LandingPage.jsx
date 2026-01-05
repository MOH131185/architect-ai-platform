/**
 * Landing Page - Deepgram-Inspired Design
 * 
 * Clean, modern, professional aesthetic inspired by Deepgram.com
 */

import React from 'react';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import Button from './ui/Button.jsx';

const LandingPage = ({ onStart }) => {
  // Features
  const features = [
    {
      icon: <Zap className="w-6 h-6" />,
      title: '60 Second Generation',
      description: 'Generate professional UK RIBA-standard A1 architectural sheets in under a minute.',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: '98% Consistency',
      description: 'Industry-leading cross-view consistency with our Design DNA system.',
    },
    {
      icon: <Building2 className="w-6 h-6" />,
      title: 'Climate-Aware',
      description: 'Automatic climate analysis and site-specific design adaptations.',
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: 'UK RIBA Standards',
      description: 'Professional A1 sheets with complete title blocks and ARB compliance.',
    },
  ];

  // Trust indicators
  const trustPoints = [
    'UK RIBA Compliant',
    '98% Consistency',
    '60s Generation',
    'Climate Intelligence',
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-lg border-b border-white/5">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={`${process.env.PUBLIC_URL || ''}/logo/logo.png`}
                alt="ArchiAI Solution Ltd."
                className="w-10 h-10"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <div>
                <div className="text-lg font-bold">ArchiAI Solution</div>
                <div className="text-xs text-gray-400">AI for Architecture & Design</div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-400 hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="text-gray-400 hover:text-white transition-colors">How It Works</a>
              <a href="#pricing" className="text-gray-400 hover:text-white transition-colors">Pricing</a>
            </div>
            <div className="flex items-center gap-4">
              <button className="text-gray-400 hover:text-white transition-colors">Log In</button>
              <Button
                variant="gradient"
                size="md"
                onClick={onStart}
              >
                Sign Up Free
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Enhanced Background with Multiple Layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950/30 via-[#0a0a0a] via-50% to-cyan-950/20" />

        {/* Animated Gradient Orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* Animated Grid */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(59,130,246,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
            animation: 'gridSlide 20s linear infinite'
          }} />
        </div>

        <style>{`
          @keyframes gridSlide {
            0% { transform: translate(0, 0); }
            100% { transform: translate(50px, 50px); }
          }
        `}</style>

        <div className="container mx-auto max-w-6xl relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 mb-8"
            >
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-300">🚀 Meet ArchiAI - AI-powered architectural design</span>
            </motion.div>

            {/* Main Heading with Enhanced Gradients */}
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black mb-6 leading-[1.1] tracking-tight">
              <span className="block">Architecture AI APIs</span>
              <span className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent animate-pulse" style={{ animationDuration: '3s' }}>
                that just work
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-xl md:text-2xl text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed">
              Build with the most accurate, realistic, and cost-effective APIs for architectural design generation. 
              Trusted by architects and leading firms. Available in real-time and batch, cloud and self-hosted.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Button
                variant="gradient"
                size="xl"
                onClick={onStart}
                icon={<ArrowRight className="w-5 h-5" />}
                iconPosition="right"
                className="min-w-[200px] bg-blue-600 hover:bg-blue-700"
              >
                Sign Up Free
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="min-w-[200px] border-gray-700 hover:bg-gray-900"
              >
                <Play className="w-5 h-5 mr-2" />
                Playground
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center justify-center gap-8 text-gray-400 text-sm">
              {trustPoints.map((point, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-400" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6 bg-[#0f0f0f]">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Choose your Architecture AI journey
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Choose the path that best fits your business needs and technical requirements.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-xl bg-[#1a1a1a] border border-gray-800 hover:border-blue-500/50 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6 bg-[#0a0a0a]">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              A single, unified Architecture AI API
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              Instead of stitching together separate components, ArchiAI unifies site analysis, 
              design generation, and AI reasoning into a single API, reducing complexity, latency, and cost.
            </p>
          </motion.div>

          {/* Workflow Diagram */}
          <div className="relative">
            <div className="grid md:grid-cols-5 gap-6">
              {[
                { icon: <MapPin className="w-6 h-6" />, title: 'Location', desc: 'Set site location' },
                { icon: <Sparkles className="w-6 h-6" />, title: 'Intelligence', desc: 'Climate analysis' },
                { icon: <FileText className="w-6 h-6" />, title: 'Portfolio', desc: 'Upload references' },
                { icon: <Code className="w-6 h-6" />, title: 'Generate', desc: 'AI creates design' },
                { icon: <Download className="w-6 h-6" />, title: 'Export', desc: 'Download A1 sheet' },
              ].map((step, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4 text-blue-400 border border-blue-500/20">
                    {step.icon}
                  </div>
                  <h3 className="font-semibold mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-400">{step.desc}</p>
                  {index < 4 && (
                    <div className="hidden md:block absolute top-8 left-full w-6 h-0.5 bg-gray-800" />
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Section */}
      <section className="py-20 px-6 bg-[#0f0f0f]">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Solutions that scale
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              As the industry's architecture AI leader, ArchiAI drives better outcomes with enterprise 
              solutions that deliver intelligent design experiences safely, securely, and at scale.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: <Building2 className="w-6 h-6" />, title: 'Build with APIs', desc: 'Architecture AI Infrastructure for Builders' },
              { icon: <Globe className="w-6 h-6" />, title: 'Integrate ArchiAI', desc: 'Architecture AI for Platforms & Partners' },
              { icon: <Lock className="w-6 h-6" />, title: 'Custom Models', desc: 'Architecture AI Solutions Built with You' },
            ].map((solution, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-8 rounded-xl bg-[#1a1a1a] border border-gray-800 hover:border-blue-500/50 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 text-blue-400">
                  {solution.icon}
                </div>
                <h3 className="text-xl font-semibold mb-2">{solution.title}</h3>
                <p className="text-gray-400 mb-4">{solution.desc}</p>
                <button className="text-blue-400 hover:text-blue-300 flex items-center gap-2">
                  Learn more <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-gradient-to-b from-[#0a0a0a] to-[#0f0f0f]">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Unlock architecture AI at scale with an API Call
            </h2>
            <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
              Get intelligent design generation with analysis and understanding on the world's best architecture AI platform.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                variant="gradient"
                size="xl"
                onClick={onStart}
                className="min-w-[200px] bg-blue-600 hover:bg-blue-700"
              >
                Sign Up Free
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="min-w-[200px] border-gray-700 hover:bg-gray-900"
              >
                Get a Demo
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-800 bg-[#0a0a0a]">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img
                src={`${process.env.PUBLIC_URL || ''}/logo/logo.png`}
                alt="ArchiAI Solution Ltd."
                className="w-8 h-8"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <div>
                <div className="text-sm font-bold">ArchiAI Solution Ltd.</div>
                <div className="text-xs text-gray-500">AI for Architecture & Design</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-400">
              <a href="#" className="hover:text-white transition-colors">Documentation</a>
              <a href="#" className="hover:text-white transition-colors">API Reference</a>
              <a href="#" className="hover:text-white transition-colors">Support</a>
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
            </div>
            <div className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} ArchiAI Solution Ltd. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
