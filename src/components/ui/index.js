// Deepgram-Inspired UI Components
export { default as Button } from "./Button.jsx";
export { default as Input } from "./Input.jsx";
export { default as Card } from "./Card.jsx";
export { default as Section } from "./Section.jsx";
export { default as AnimatedHeading } from "./AnimatedHeading.jsx";
export { default as GradientBorderBox } from "./GradientBorderBox.jsx";
export { default as StatCard } from "./StatCard.jsx";
export { default as FeatureGrid } from "./FeatureGrid.jsx";
export { default as BlueprintPanel } from "./BlueprintPanel.jsx";
export { default as AnimatedBackground } from "./AnimatedBackground.jsx";
export { default as NoiseLayer } from "./NoiseLayer.jsx";
export { default as IconWrapper } from "./IconWrapper.jsx";
export { default as Spinner } from "./Spinner.jsx";
export { default as Badge } from "./Badge.jsx";

// Logo components
export { default as CompanyLogo } from "./CompanyLogo.jsx";
export { default as AnimatedBlueprintLogo } from "./AnimatedBlueprintLogo.jsx";
export { default as BlueprintLogoLoader } from "./BlueprintLogoLoader.jsx";

// Legacy components (preserved for compatibility)
export { default as GlassButton } from "./GlassButton.jsx";
export { default as GlassCard } from "./GlassCard.jsx";
export { default as GlassModal } from "./GlassModal.jsx";
export { default as GlassNavbar } from "./GlassNavbar.jsx";
export { default as HeroSection } from "./HeroSection.jsx";

// Utility function for className merging
export const cn = (...classes) => {
  return classes.filter(Boolean).join(" ");
};
