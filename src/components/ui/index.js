// Deepgram-Inspired UI Components
export { default as Button } from './Button';
export { default as Input } from './Input';
export { default as Card } from './Card';
export { default as Section } from './Section';
export { default as AnimatedHeading } from './AnimatedHeading';
export { default as GradientBorderBox } from './GradientBorderBox';
export { default as StatCard } from './StatCard';
export { default as FeatureGrid } from './FeatureGrid';
export { default as BlueprintPanel } from './BlueprintPanel';
export { default as AnimatedBackground } from './AnimatedBackground';
export { default as NoiseLayer } from './NoiseLayer';
export { default as IconWrapper } from './IconWrapper';
export { default as Spinner } from './Spinner';
export { default as Badge } from './Badge';

// Legacy components (preserved for compatibility)
export { default as GlassButton } from './GlassButton';
export { default as GlassCard } from './GlassCard';
export { default as GlassModal } from './GlassModal';
export { default as GlassNavbar } from './GlassNavbar';
export { default as HeroSection } from './HeroSection';

// Utility function for className merging
export const cn = (...classes) => {
  return classes.filter(Boolean).join(' ');
};
