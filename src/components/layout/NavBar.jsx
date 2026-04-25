import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import PropTypes from "prop-types";
import { fadeInDown } from "../../styles/animations.js";
import Button from "../ui/Button.jsx";
import { Layers } from "lucide-react";
import CompanyLogo from "../ui/CompanyLogo.jsx";
import UsageChip from "../UsageChip.jsx";
import {
  AuthSignInButton,
  AuthSignedIn,
  AuthSignedOut,
  AuthUserButton,
} from "../../services/auth/clerkFacade.js";

const NavBar = ({
  onNewDesign,
  onPricing,
  showNewDesign = true,
  transparent = false,
  className = "",
}) => {
  const [scrolled, setScrolled] = useState(false);
  // Hash-based active link tracking — works for landing page anchors
  // (#features / #how-it-works / #about) without coupling to a router.
  const [activeHref, setActiveHref] = useState(
    typeof window !== "undefined" ? window.location.hash || "#" : "#",
  );

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    const handleHashChange = () => {
      setActiveHref(window.location.hash || "#");
    };

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const navClasses = `fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
    scrolled && !transparent
      ? "bg-navy-950/95 backdrop-blur-xl border-b border-white/10 shadow-xl"
      : transparent
        ? "bg-transparent"
        : "bg-navy-950/50 backdrop-blur-sm"
  } ${className}`;

  const innerHeightClass = scrolled ? "h-16" : "h-20";
  const logoSize = scrolled ? 44 : 56;

  return (
    <motion.nav
      className={navClasses}
      variants={fadeInDown}
      initial="initial"
      animate="animate"
    >
      <div className="container mx-auto px-4">
        <div
          className={`flex items-center justify-between transition-all duration-300 ${innerHeightClass}`}
        >
          {/* Logo */}
          <motion.div
            className="flex items-center gap-3 cursor-pointer"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setActiveHref("#")}
          >
            <CompanyLogo
              size={logoSize}
              className="mr-2 transition-all duration-300"
            />
            <div>
              <h1 className="text-xl font-bold text-white font-heading">
                ArchiAI Solution
              </h1>
              <p className="text-xs text-white/55">
                AI for Architecture & Design
              </p>
            </div>
          </motion.div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            <NavLink
              href="#features"
              activeHref={activeHref}
              onActivate={setActiveHref}
            >
              Features
            </NavLink>
            <NavLink
              href="#how-it-works"
              activeHref={activeHref}
              onActivate={setActiveHref}
            >
              How It Works
            </NavLink>
            <NavLink
              href="#about"
              activeHref={activeHref}
              onActivate={setActiveHref}
            >
              About
            </NavLink>
            {onPricing && (
              <motion.button
                onClick={() => {
                  setActiveHref("#pricing");
                  onPricing();
                }}
                className="relative text-white/70 hover:text-white transition-colors duration-200 font-medium pb-1"
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
              >
                Pricing
                {activeHref === "#pricing" && (
                  <motion.span
                    layoutId="navbar-active-underline"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-royal-400 rounded-full"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </motion.button>
            )}
          </div>

          {/* CTA / Auth area */}
          <div className="flex items-center gap-3">
            {showNewDesign && (
              <Button
                variant="gradient"
                size="md"
                onClick={onNewDesign}
                icon={<Layers className="w-5 h-5" />}
              >
                New Design
              </Button>
            )}
            <AuthSignedOut>
              <AuthSignInButton mode="modal">
                <button className="px-4 py-2 text-sm font-medium text-white/90 border border-white/15 rounded-lg hover:bg-white/5 hover:border-white/25 transition-colors">
                  Sign In
                </button>
              </AuthSignInButton>
            </AuthSignedOut>
            <AuthSignedIn>
              <UsageChip />
              <AuthUserButton afterSignOutUrl="/" />
            </AuthSignedIn>
          </div>
        </div>
      </div>
    </motion.nav>
  );
};

const NavLink = ({ href, activeHref, onActivate, children }) => {
  const isActive = activeHref === href;

  return (
    <motion.a
      href={href}
      onClick={() => onActivate && onActivate(href)}
      className={`relative pb-1 font-medium transition-colors duration-200 ${
        isActive ? "text-white" : "text-white/70 hover:text-white"
      }`}
      whileHover={{ y: -2 }}
      whileTap={{ y: 0 }}
    >
      {children}
      {isActive && (
        <motion.span
          layoutId="navbar-active-underline"
          className="absolute -bottom-1 left-0 right-0 h-0.5 bg-royal-400 rounded-full"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
    </motion.a>
  );
};

NavLink.propTypes = {
  href: PropTypes.string.isRequired,
  activeHref: PropTypes.string,
  onActivate: PropTypes.func,
  children: PropTypes.node,
};

NavBar.propTypes = {
  onNewDesign: PropTypes.func,
  onPricing: PropTypes.func,
  showNewDesign: PropTypes.bool,
  transparent: PropTypes.bool,
  className: PropTypes.string,
};

export default NavBar;
