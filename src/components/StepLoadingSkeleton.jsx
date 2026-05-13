import React from "react";
import Card from "./ui/Card.jsx";

const StepLoadingSkeleton = ({ label = "Loading..." }) => (
  <Card
    role="status"
    aria-live="polite"
    className="mx-auto flex min-h-[40vh] max-w-3xl items-center justify-center border border-navy-700 bg-navy-950/70 p-10 text-center text-white"
  >
    <div className="flex flex-col items-center gap-4">
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white"
      />
      <span className="text-sm text-white/70">{label}</span>
    </div>
  </Card>
);

export default StepLoadingSkeleton;
