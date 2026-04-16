/**
 * UsageChip — small header pill showing "N / M sheets" for the current user.
 *
 * Self-fetches /api/me when signed in. Subscribes to a global "usage:refresh"
 * event so generations/complete can trigger a re-fetch without prop drilling.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

const REFRESH_EVENT = "archiai:usage-refresh";

export function triggerUsageRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REFRESH_EVENT));
  }
}

const UsageChip = ({ onUpgradeClick }) => {
  const { isSignedIn, getToken } = useAuth();
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: null,
  });

  const fetchUsage = useCallback(async () => {
    if (!isSignedIn) {
      setState({ loading: false, data: null, error: null });
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState({ loading: false, data, error: null });
    } catch (err) {
      setState({ loading: false, data: null, error: err.message });
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  useEffect(() => {
    const handler = () => fetchUsage();
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [fetchUsage]);

  if (!isSignedIn) return null;
  if (state.loading) {
    return (
      <span className="text-xs text-gray-400 px-3 py-1 rounded-full border border-navy-700 bg-navy-900/60">
        ...
      </span>
    );
  }
  if (!state.data) return null;

  const { plan, remaining, limit, unlimited } = state.data;
  const label = unlimited
    ? `Unlimited · ${plan}`
    : `${remaining}/${limit} sheets · ${plan}`;
  const isLow = !unlimited && remaining <= 1;

  const chip = (
    <span
      className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
        isLow
          ? "border-amber-600 bg-amber-900/30 text-amber-200"
          : "border-navy-700 bg-navy-900/60 text-gray-200"
      }`}
      title={`Plan: ${plan}${unlimited ? "" : ` · ${remaining} of ${limit} remaining`}`}
    >
      {label}
    </span>
  );

  if (isLow && onUpgradeClick) {
    return (
      <button type="button" onClick={onUpgradeClick} className="cursor-pointer">
        {chip}
      </button>
    );
  }
  return chip;
};

export default UsageChip;
