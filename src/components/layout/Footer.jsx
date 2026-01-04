import React from 'react';
import { motion } from 'framer-motion';
import { Layers, Github, Twitter, Linkedin } from 'lucide-react';
import { fadeInUp } from '../../styles/animations.js';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="relative bg-navy-950 border-t border-navy-800">
      {/* Architectural accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-royal-600 to-transparent" />
      
      <div className="container mx-auto px-4 py-12">
        <motion.div
          className="grid grid-cols-1 md:grid-cols-4 gap-8"
          variants={fadeInUp}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
        >
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-royal-600 to-royal-400 flex items-center justify-center">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white font-heading">
                  ArchitectAI
                </h3>
                <p className="text-xs text-gray-400">
                  Design with Intelligence
                </p>
              </div>
            </div>
            <p className="text-gray-400 max-w-md mb-6">
              AI-powered architectural design platform generating professional UK RIBA-standard A1 sheets with 98%+ consistency in 60 seconds.
            </p>
            <div className="flex items-center gap-4">
              <SocialLink href="#" icon={<Github className="w-5 h-5" />} />
              <SocialLink href="#" icon={<Twitter className="w-5 h-5" />} />
              <SocialLink href="#" icon={<Linkedin className="w-5 h-5" />} />
            </div>
          </div>
          
          {/* Product */}
          <div>
            <h4 className="text-white font-semibold mb-4 font-heading">Product</h4>
            <ul className="space-y-2">
              <FooterLink href="#features">Features</FooterLink>
              <FooterLink href="#how-it-works">How It Works</FooterLink>
              <FooterLink href="#pricing">Pricing</FooterLink>
              <FooterLink href="#updates">Updates</FooterLink>
            </ul>
          </div>
          
          {/* Company */}
          <div>
            <h4 className="text-white font-semibold mb-4 font-heading">Company</h4>
            <ul className="space-y-2">
              <FooterLink href="#about">About</FooterLink>
              <FooterLink href="#contact">Contact</FooterLink>
              <FooterLink href="#privacy">Privacy</FooterLink>
              <FooterLink href="#terms">Terms</FooterLink>
            </ul>
          </div>
        </motion.div>
        
        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-navy-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">
              © {currentYear} ArchitectAI. All rights reserved.
            </p>
            <p className="text-gray-500 text-sm">
              Built with AI • Designed for Architects
            </p>
          </div>
        </div>
      </div>
      
      {/* Architectural corner accents */}
      <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-royal-600/20" />
      <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-royal-600/20" />
    </footer>
  );
};

const SocialLink = ({ href, icon }) => {
  return (
    <motion.a
      href={href}
      className="w-10 h-10 rounded-lg bg-navy-800 border border-navy-700 flex items-center justify-center text-gray-400 hover:text-white hover:border-royal-600 transition-all duration-200"
      whileHover={{ y: -2, boxShadow: '0 0 20px rgba(37, 99, 235, 0.3)' }}
      whileTap={{ scale: 0.95 }}
    >
      {icon}
    </motion.a>
  );
};

const FooterLink = ({ href, children }) => {
  return (
    <li>
      <a
        href={href}
        className="text-gray-400 hover:text-white transition-colors duration-200"
      >
        {children}
      </a>
    </li>
  );
};

export default Footer;

