import React, {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import PropTypes from "prop-types";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const TabsContext = createContext(null);

const Tabs = ({
  value,
  defaultValue,
  onChange,
  children,
  className,
  variant = "underline",
}) => {
  const [internal, setInternal] = useState(defaultValue);
  const isControlled = value !== undefined;
  const active = isControlled ? value : internal;
  const groupId = useId();

  const setActive = useCallback(
    (next) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  const ctx = useMemo(
    () => ({ active, setActive, groupId, variant }),
    [active, setActive, groupId, variant],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn("flex flex-col", className)}>{children}</div>
    </TabsContext.Provider>
  );
};

const TabsList = ({ children, className, ariaLabel = "Tabs" }) => {
  const { variant } = useContext(TabsContext) || {};
  const listRef = useRef(null);

  const handleKeyDown = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = Array.from(
      listRef.current?.querySelectorAll('[role="tab"]:not([disabled])') || [],
    );
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex === -1) return;
    e.preventDefault();
    let next;
    if (e.key === "ArrowRight") next = (currentIndex + 1) % tabs.length;
    else if (e.key === "ArrowLeft")
      next = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else next = tabs.length - 1;
    tabs[next]?.focus();
    tabs[next]?.click();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex items-center gap-1",
        variant === "pill"
          ? "rounded-xl border border-white/10 bg-white/[0.03] p-1"
          : "border-b border-white/8",
        className,
      )}
    >
      {children}
    </div>
  );
};

const Tab = ({ value, children, icon, disabled = false, className }) => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab must be used inside <Tabs>");
  const { active, setActive, groupId, variant } = ctx;
  const isActive = active === value;

  const baseClasses =
    "relative inline-flex items-center gap-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-500/40 disabled:opacity-40 disabled:cursor-not-allowed";

  const variantClasses =
    variant === "pill"
      ? cn(
          "rounded-lg px-3 py-1.5",
          isActive
            ? "bg-white/10 text-white"
            : "text-white/60 hover:text-white",
        )
      : cn(
          "px-1 pb-3 pt-2",
          isActive ? "text-white" : "text-white/60 hover:text-white/85",
        );

  return (
    <button
      type="button"
      role="tab"
      id={`${groupId}-trigger-${value}`}
      aria-controls={`${groupId}-panel-${value}`}
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => setActive(value)}
      className={cn(baseClasses, variantClasses, className)}
    >
      {icon && (
        <span className="flex-shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
      {variant !== "pill" && isActive && (
        <motion.span
          layoutId={`${groupId}-active-indicator`}
          className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-royal-400"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
    </button>
  );
};

const TabsPanel = ({ value, children, className }) => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabsPanel must be used inside <Tabs>");
  const { active, groupId } = ctx;
  if (active !== value) return null;

  return (
    <div
      role="tabpanel"
      id={`${groupId}-panel-${value}`}
      aria-labelledby={`${groupId}-trigger-${value}`}
      tabIndex={0}
      className={cn("focus:outline-none", className)}
    >
      {children}
    </div>
  );
};

Tabs.propTypes = {
  value: PropTypes.string,
  defaultValue: PropTypes.string,
  onChange: PropTypes.func,
  children: PropTypes.node,
  className: PropTypes.string,
  variant: PropTypes.oneOf(["underline", "pill"]),
};

TabsList.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  ariaLabel: PropTypes.string,
};

Tab.propTypes = {
  value: PropTypes.string.isRequired,
  children: PropTypes.node,
  icon: PropTypes.node,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

TabsPanel.propTypes = {
  value: PropTypes.string.isRequired,
  children: PropTypes.node,
  className: PropTypes.string,
};

export default Tabs;
export { Tabs, TabsList, Tab, TabsPanel };
