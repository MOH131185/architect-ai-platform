import React, { useEffect } from 'react';
import {
  MapPin, Sparkles, FileCode, Palette, Zap, Shield,
  Building, Clock, TrendingUp, Users, BarChart3, ArrowRight
} from 'lucide-react';
import { useArchitectWorkflow } from '../hooks/useArchitectWorkflow';

/**
 * LandingPage - Welcome page with hero section, features, and metrics
 *
 * Displays:
 * - Hero section with platform branding
 * - Key metrics (design time, cost reduction, active users, projects)
 * - Feature grid showcasing capabilities
 * - Call-to-action button to start the workflow
 *
 * @component
 */
const LandingPage = () => {
  const { nextStep } = useArchitectWorkflow();

  // Fade in animation on mount
  useEffect(() => {
    const heroContent = document.getElementById('hero-content');
    if (heroContent) {
      setTimeout(() => {
        heroContent.style.opacity = '1';
      }, 100);
    }
  }, []);

  const metrics = [
    { icon: Clock, label: "Design Time", value: "5 minutes", subtext: "vs 2-3 weeks traditional" },
    { icon: TrendingUp, label: "Cost Reduction", value: "85%", subtext: "in design phase costs" },
    { icon: Users, label: "Active Architects", value: "2,450+", subtext: "using our platform" },
    { icon: BarChart3, label: "Projects Created", value: "12,000+", subtext: "successful designs" }
  ];

  const features = [
    {
      icon: MapPin,
      title: "Location Intelligence",
      description: "Analyze climate, zoning, and local architecture to inform optimal design decisions"
    },
    {
      icon: Sparkles,
      title: "AI Design Generation",
      description: "Create complete 2D/3D designs from requirements in minutes with style synthesis"
    },
    {
      icon: FileCode,
      title: "Technical Documentation",
      description: "Auto-generate all structural and MEP drawings with code compliance"
    },
    {
      icon: Palette,
      title: "Style Blending",
      description: "Seamlessly blend architect portfolios with location-appropriate styles"
    },
    {
      icon: Zap,
      title: "Real-time Modifications",
      description: "Use natural language to instantly modify designs and see results"
    },
    {
      icon: Shield,
      title: "Industry Standards",
      description: "Export to all major CAD formats: DWG, RVT, IFC with full compatibility"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-16">
        <div id="hero-content" className="opacity-0 transition-opacity duration-1000">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="flex justify-center items-center mb-6">
              <Building className="w-12 h-12 text-blue-400 mr-3" />
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                ArchitectAI Platform
              </h1>
            </div>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Transform any location into intelligent architectural designs in minutes, not months.
              AI-powered design generation with full technical documentation.
            </p>
          </div>

          {/* Key Metrics */}
          <div className="grid md:grid-cols-4 gap-6 mb-16">
            {metrics.map((metric, idx) => (
              <div
                key={idx}
                className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20"
              >
                <metric.icon className="w-8 h-8 text-blue-400 mb-3" />
                <h3 className="text-3xl font-bold mb-1">{metric.value}</h3>
                <p className="text-sm text-gray-300">{metric.label}</p>
                <p className="text-xs text-gray-400 mt-1">{metric.subtext}</p>
              </div>
            ))}
          </div>

          {/* Feature Grid */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10 hover:bg-white/10 transition-all duration-300"
              >
                <feature.icon className="w-10 h-10 text-blue-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-300">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <button
              onClick={nextStep}
              className="group bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-4 rounded-full font-semibold text-lg hover:shadow-2xl hover:shadow-blue-500/25 transition-all duration-300 flex items-center mx-auto"
            >
              <span>Start Live Demo</span>
              <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
            <p className="text-sm text-gray-400 mt-4">No login required • 5-minute walkthrough</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
