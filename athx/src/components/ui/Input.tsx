'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

const FIELD =
  'w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-white placeholder:text-white/35 transition-colors focus:border-nacao-cyan/60 focus:bg-white/[0.09] disabled:opacity-45';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }
>(function Input({ label, hint, error, className = '', id, ...props }, ref) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="w-full">
      {label ? (
        <label
          htmlFor={fieldId}
          className="mb-1.5 block font-display text-[11px] font-bold uppercase tracking-wider text-white/60"
        >
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${FIELD} h-11 ${error ? 'border-red-400/70' : ''} ${className}`}
        {...props}
      />
      {error ? (
        <p id={`${fieldId}-err`} role="alert" className="mt-1 text-xs text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1 text-xs text-white/45">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/** Campo numérico grande para lançamento sob pressão (§16 / §40). */
export const ScoreInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string; suffix?: string }
>(function ScoreInput({ label, suffix, className = '', id, ...props }, ref) {
  const auto = useId();
  const fieldId = id ?? auto;

  return (
    <div className="w-full">
      {label ? (
        <label
          htmlFor={fieldId}
          className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-white/55"
        >
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          inputMode="decimal"
          autoComplete="off"
          className={`${FIELD} tnum h-12 text-center font-display text-lg font-bold tabular-nums ${suffix ? 'pr-9' : ''} ${className}`}
          {...props}
        />
        {suffix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] font-bold text-white/35"
          >
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { label?: string; children: ReactNode }
>(function Select({ label, className = '', id, children, ...props }, ref) {
  const auto = useId();
  const fieldId = id ?? auto;

  return (
    <div className="w-full">
      {label ? (
        <label
          htmlFor={fieldId}
          className="mb-1.5 block font-display text-[11px] font-bold uppercase tracking-wider text-white/60"
        >
          {label}
        </label>
      ) : null}
      <select
        ref={ref}
        id={fieldId}
        className={`${FIELD} h-11 appearance-none bg-[length:14px] bg-[right_0.85rem_center] bg-no-repeat pr-9 ${className}`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23ffffff88'%3E%3Cpath d='M8 11 3 5.5h10z'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {children}
      </select>
    </div>
  );
});
