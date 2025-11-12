/**
 * ErrorBanner Component
 *
 * Displays error messages with optional retry action.
 *
 * @module components/ErrorBanner
 */

import React from 'react';
import { colors, spacing, borderRadius, shadows } from '../ui/tokens.js';

/**
 * ErrorBanner component
 *
 * @param {Object} props - Component props
 * @param {string} props.message - Error message to display
 * @param {string} [props.title='Error'] - Error title
 * @param {Function} [props.onRetry] - Retry callback function
 * @param {Function} [props.onDismiss] - Dismiss callback function
 * @param {('error'|'warning'|'info')} [props.variant='error'] - Banner variant
 * @param {string} [props.className] - Additional CSS class names
 * @returns {JSX.Element}
 */
export default function ErrorBanner({
  message,
  title = 'Error',
  onRetry,
  onDismiss,
  variant = 'error',
  className = ''
}) {
  const variantColors = {
    error: {
      bg: colors.error.light,
      border: colors.error.main,
      text: colors.error.dark,
      icon: '❌'
    },
    warning: {
      bg: colors.warning.light,
      border: colors.warning.main,
      text: colors.warning.dark,
      icon: '⚠️'
    },
    info: {
      bg: colors.info.light,
      border: colors.info.main,
      text: colors.info.dark,
      icon: 'ℹ️'
    }
  };

  const variantStyle = variantColors[variant] || variantColors.error;

  const containerStyle = {
    backgroundColor: variantStyle.bg,
    border: `2px solid ${variantStyle.border}`,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    boxShadow: shadows.sm,
    display: 'flex',
    alignItems: 'flex-start',
    gap: `${spacing.sm}px`
  };

  const iconStyle = {
    fontSize: '24px',
    lineHeight: 1,
    flexShrink: 0
  };

  const contentStyle = {
    flex: 1
  };

  const titleStyle = {
    margin: 0,
    marginBottom: `${spacing.xs}px`,
    color: variantStyle.text,
    fontSize: '16px',
    fontWeight: 600
  };

  const messageStyle = {
    margin: 0,
    color: variantStyle.text,
    fontSize: '14px',
    lineHeight: 1.5
  };

  const actionsStyle = {
    marginTop: `${spacing.sm}px`,
    display: 'flex',
    gap: `${spacing.sm}px`
  };

  const buttonBaseStyle = {
    padding: `${spacing.xs}px ${spacing.md}px`,
    borderRadius: borderRadius.base,
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.2s'
  };

  const retryButtonStyle = {
    ...buttonBaseStyle,
    backgroundColor: variantStyle.text,
    color: '#FFFFFF'
  };

  const dismissButtonStyle = {
    ...buttonBaseStyle,
    backgroundColor: 'transparent',
    color: variantStyle.text,
    border: `1px solid ${variantStyle.text}`
  };

  return (
    <div style={containerStyle} className={className} role="alert">
      <div style={iconStyle}>{variantStyle.icon}</div>
      <div style={contentStyle}>
        <h4 style={titleStyle}>{title}</h4>
        <p style={messageStyle}>{message}</p>
        {(onRetry || onDismiss) && (
          <div style={actionsStyle}>
            {onRetry && (
              <button onClick={onRetry} style={retryButtonStyle}>
                Try Again
              </button>
            )}
            {onDismiss && (
              <button onClick={onDismiss} style={dismissButtonStyle}>
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
