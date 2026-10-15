// Basic form primitives. Clean and accessible; the full visual design comes in step 5.
import type { ComponentProps, ReactNode } from "react";

const control =
  "mt-1.5 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-[15px] text-neutral-900 " +
  "placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 " +
  "aria-[invalid=true]:border-red-500 disabled:bg-neutral-100";

type FieldProps = { label: string; name: string; error?: string; hint?: string; required?: boolean };

function FieldShell({ label, name, error, hint, required, children }: FieldProps & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-neutral-800">
        {label}
        {required ? <span className="text-red-600"> *</span> : <span className="text-neutral-400"> (optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${name}-hint`} className="mt-1 text-xs text-neutral-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (name: string, error?: string, hint?: string) =>
  error ? `${name}-error` : hint ? `${name}-hint` : undefined;

export function TextField({
  label,
  name,
  error,
  hint,
  required,
  className = "",
  ...props
}: FieldProps & Omit<ComponentProps<"input">, "name">) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} required={required}>
      <input
        id={name}
        name={name}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy(name, error, hint)}
        className={`${control} ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  name,
  error,
  hint,
  required,
  className = "",
  ...props
}: FieldProps & Omit<ComponentProps<"textarea">, "name">) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} required={required}>
      <textarea
        id={name}
        name={name}
        rows={4}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy(name, error, hint)}
        className={`${control} ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  required,
  options,
  placeholder = "Choose…",
  className = "",
  ...props
}: FieldProps & { options: Record<string, string>; placeholder?: string } & Omit<ComponentProps<"select">, "name">) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} required={required}>
      <select
        id={name}
        name={name}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy(name, error, hint)}
        className={`${control} ${className}`}
        defaultValue={props.value === undefined ? "" : undefined}
        {...props}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  error,
  ...props
}: { label: ReactNode; name: string; error?: string } & Omit<ComponentProps<"input">, "name" | "type">) {
  return (
    <div>
      <label className="flex items-start gap-3 text-sm text-neutral-700">
        <input
          type="checkbox"
          id={name}
          name={name}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
          className="mt-0.5 size-4 shrink-0 rounded border-neutral-300 accent-neutral-900"
          {...props}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p id={`${name}-error`} className="mt-1 pl-7 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-700",
    secondary: "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const styles = {
    info: "border-neutral-200 bg-neutral-50 text-neutral-700",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      {title && <h2 className="mb-4 text-base font-semibold text-neutral-900">{title}</h2>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}
