/**
 * EmptyState Component
 *
 * Displays an empty state with icon, message, and optional action.
 *
 * @module components/EmptyState
 */

import React from 'react';
import { colors, spacing, typography } from '../ui/tokens.js';

/**
 * EmptyState component
 *
 * @param {Object} props - Component props
 * @param {string} props.icon - Icon emoji or text
 * @param {string} props.title - Empty state title
 * @param {string} props.message - Empty state message
 * @param {Object} [props.action] - Action button props
 * @param {string} props.action.label - Button label
 * @param {Function} props.action.onClick - Button click handler
 * @param {string} [props.className] - Additional CSS class names
 * @returns {JSX.Element}
 */
export default function EmptyState({ icon, title, message, action, className = '' }) {
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${spacing['3xl']}px ${spacing.lg}px`,
    textAlign: 'center'
  };

  const iconStyle = {
    fontSize: '64px',
    lineHeight: 1,
    marginBottom: `${spacing.lg}px`,
    opacity: 0.7
  };

  const titleStyle = {
    margin: 0,
    marginBottom: `${spacing.sm}px`,
    color: colors.text.primary,
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold
  };

  const messageStyle = {
    margin: 0,
    marginBottom: `${spacing.lg}px`,
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    lineHeight: typography.lineHeight.relaxed,
    maxWidth: '400px'
  };

  const buttonStyle = {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    backgroundColor: colors.primary[500],
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
  };

  return (
    <div style={containerStyle} className={className}>
      {icon && <div style={iconStyle}>{icon}</div>}
      <h3 style={titleStyle}>{title}</h3>
      <p style={messageStyle}>{message}</p>
      {action && (
        <button onClick={action.onClick} style={buttonStyle}>
          {action.label}
        </button>
      )}
    </div>
  );
}
