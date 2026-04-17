/**
 * UsageChip — small pill showing "X/Y sheets this month" next to UserButton.
 * Fetches from /api/me on mount and after each generation (listens to a custom event).
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";

const UsageChip = () => {
  const { getToken, isSignedIn } = useAuth();
  const [usage, setUsage] = useState(null);

  const fetchUsage = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch {
      // Silently fail — usage chip is non-critical
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Refresh after a generation completes
  useEffect(() => {
    const handler = () => fetchUsage();
    window.addEventListener("archiai:generation-complete", handler);
    return () =>
      window.removeEventListener("archiai:generation-complete", handler);
  }, [fetchUsage]);

  if (!isSignedIn || !usage) return null;

  const { remaining, limit, plan } = usage;
  const isUnlimited = limit === null || limit === undefined;
  const label = isUnlimited ? "Unlimited" : `${remaining ?? 0}/${limit} left`;

  const isLow = !isUnlimited && (remaining ?? 0) <= 1;

  return (
    <span
      className={`text-xs px-2 py-1 rounded-full font-medium border ${
        isLow
          ? "bg-red-900/40 border-red-700 text-red-300"
          : "bg-navy-800/60 border-navy-700 text-gray-300"
      }`}
      title={`${plan} plan · ${label} this month`}
    >
      {label}
    </span>
  );
};

export default UsageChip;
