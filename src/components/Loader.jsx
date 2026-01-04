/**
 * Loader Component
 *
 * Reusable loading spinner with customizable size and color.
 *
 * @module components/Loader
 */

import React from 'react';
import { colors, spacing } from '../ui/tokens.js';

/**
 * Loader sizes
 */
const SIZES = {
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48
};

/**
 * Loader component
 *
 * @param {Object} props - Component props
 * @param {('sm'|'md'|'lg'|'xl')} [props.size='md'] - Loader size
 * @param {string} [props.color] - Loader color (defaults to primary)
 * @param {string} [props.message] - Loading message to display
 * @param {boolean} [props.fullscreen] - Whether to show fullscreen overlay
 * @param {string} [props.className] - Additional CSS class names
 * @returns {JSX.Element}
 */
export default function Loader({
  size = 'md',
  color = colors.primary[500],
  message = '',
  fullscreen = false,
  className = ''
}) {
  const loaderSize = SIZES[size] || SIZES.md;

  const spinnerStyle = {
    width: `${loaderSize}px`,
    height: `${loaderSize}px`,
    border: `3px solid ${colors.gray[200]}`,
    borderTop: `3px solid ${color}`,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  };

  const containerStyle = fullscreen
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${spacing.lg}px`
      };

  const messageStyle = {
    marginTop: `${spacing.md}px`,
    color: colors.text.secondary,
    fontSize: '14px',
    fontWeight: 500
  };

  return (
    <div style={containerStyle} className={className}>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={spinnerStyle} role="status" aria-label="Loading" />
      {message && <div style={messageStyle}>{message}</div>}
    </div>
  );
}
