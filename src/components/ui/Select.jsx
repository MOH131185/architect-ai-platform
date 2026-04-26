import React, { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";
import PropTypes from "prop-types";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Styled native <select> wrapper. Native is intentional — it gives free
 * keyboard support, accessibility, and mobile (iOS picker / Android wheel)
 * without rolling a custom dropdown.
 *
 * Pass <option> children directly. Use placeholder for the empty initial state.
 */
const Select = forwardRef(
  (
    {
      label,
      value,
      onChange,
      onBlur,
      onFocus,
      children,
      placeholder,
      error,
      helperText,
      disabled = false,
      required = false,
      icon = null,
      fullWidth = true,
      className = "",
      selectClassName = "",
      id: idProp,
      name,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = idProp || generatedId;
    const helperId = `${id}-helper`;

    const wrapperClasses = cn(
      "flex flex-col gap-1.5",
      fullWidth ? "w-full" : "",
      className,
    );

    const baseSelectClasses =
      "w-full appearance-none rounded-xl bg-white/5 py-3 pr-10 text-sm text-white placeholder-white/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-royal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

    const paddingLeft = icon ? "pl-12" : "pl-4";

    const borderClasses = error
      ? "border border-error-500/60 focus:border-error-500 focus:ring-error-500/30"
      : "border border-white/10 hover:border-white/20 focus:border-royal-500";

    return (
      <div className={wrapperClasses}>
        {label && (
          <label
            htmlFor={id}
            className="text-xs font-medium uppercase tracking-wider text-white/60"
          >
            {label}
            {required && <span className="ml-1 text-error-400">*</span>}
          </label>
        )}

        <div className="relative">
          {icon && (
            <span
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}

          <select
            ref={ref}
            id={id}
            name={name}
            value={value ?? ""}
            onChange={onChange}
            onBlur={onBlur}
            onFocus={onFocus}
            disabled={disabled}
            required={required}
            aria-invalid={!!error}
            aria-describedby={error || helperText ? helperId : undefined}
            className={cn(
              baseSelectClasses,
              paddingLeft,
              borderClasses,
              selectClassName,
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {children}
          </select>

          <ChevronDown
            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>

        {(error || helperText) && (
          <p
            id={helperId}
            className={cn(
              "text-xs",
              error ? "text-error-300" : "text-white/50",
            )}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = "Select";

Select.propTypes = {
  label: PropTypes.node,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func,
  onBlur: PropTypes.func,
  onFocus: PropTypes.func,
  children: PropTypes.node,
  placeholder: PropTypes.string,
  error: PropTypes.string,
  helperText: PropTypes.string,
  disabled: PropTypes.bool,
  required: PropTypes.bool,
  icon: PropTypes.node,
  fullWidth: PropTypes.bool,
  className: PropTypes.string,
  selectClassName: PropTypes.string,
  id: PropTypes.string,
  name: PropTypes.string,
};

export default Select;
export { Select };
