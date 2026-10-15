"use client";

import type { ReactNode } from "react";
import { formatIndianDigits } from "@/lib/booking/events";
import { addDaysIST, maxBookingDateIST, UPLOAD_MIME_TYPES } from "@/lib/validation";
import type { FieldDef, Values } from "./types";

export const fieldId = (key: string) => `f_${key}`;
const errorId = (key: string) => `f_${key}_error`;
const helpId = (key: string) => `f_${key}_help`;

const control =
  "mt-1.5 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-[15px] text-neutral-900 " +
  "placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 " +
  "aria-[invalid=true]:border-red-500";

export type FileState =
  | { status: "idle" }
  | { status: "uploading"; name: string }
  | { status: "done"; name: string; size: number; path: string }
  | { status: "error"; name?: string; message: string; canRetry: boolean };

type Props = {
  field: FieldDef;
  values: Values;
  error?: string;
  onChange: (key: string, value: string | string[] | undefined) => void;
  onBlur: (key: string) => void;
  /** Verified phone row. */
  phone?: string;
  onChangePhone?: () => void;
  /** File field. */
  file?: FileState;
  onFile?: (file: File | null) => void;
  onRetryFile?: () => void;
};

function Label({ field, htmlFor, as = "label" }: { field: FieldDef; htmlFor?: string; as?: "label" | "legend" }) {
  const Tag = as;
  return (
    <Tag {...(as === "label" ? { htmlFor } : {})} className="block text-sm font-medium text-neutral-800">
      {field.label}
      {field.optional ? (
        <span className="font-normal text-neutral-400"> (optional)</span>
      ) : (
        <span className="text-red-600" aria-hidden="true">
          {" "}
          *
        </span>
      )}
    </Tag>
  );
}

function Help({ field, extra }: { field: FieldDef; extra?: ReactNode }) {
  if (!field.help && !extra) return null;
  return (
    <p id={helpId(field.key)} className="mt-1 flex justify-between gap-3 text-xs text-neutral-500">
      <span>{field.help}</span>
      {extra}
    </p>
  );
}

function ErrorText({ k, error }: { k: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={errorId(k)} className="mt-1 text-sm text-red-600">
      {error}
    </p>
  );
}

export function Field({ field, values, error, onChange, onBlur, phone, onChangePhone, file, onFile, onRetryFile }: Props) {
  const { key } = field;
  const id = fieldId(key);
  const raw = values[key];
  const value = typeof raw === "string" ? raw : "";
  const describedBy = [error ? errorId(key) : null, field.help ? helpId(key) : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    name: key,
    "aria-invalid": !!error,
    "aria-describedby": describedBy,
    "aria-required": !field.optional,
    onBlur: () => onBlur(key),
  };

  switch (field.kind) {
    case "verified-phone":
      return (
        <div>
          <span className="block text-sm font-medium text-neutral-800">{field.label}</span>
          <p className="mt-1.5 flex flex-wrap items-center gap-3 text-[15px] text-neutral-900">
            <span>{phone}</span>
            <button type="button" onClick={onChangePhone} className="text-sm underline">
              Change
            </button>
          </p>
          <Help field={field} />
        </div>
      );

    case "text":
    case "email":
    case "url":
    case "phone":
    case "time":
    case "date": {
      const type = { text: "text", email: "email", url: "url", phone: "tel", time: "time", date: "date" }[field.kind];
      const inputMode = { text: undefined, email: "email", url: "url", phone: "tel", time: undefined, date: undefined }[
        field.kind
      ] as "email" | "url" | "tel" | undefined;
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <input
            {...common}
            type={type}
            inputMode={inputMode}
            className={control}
            value={value}
            placeholder={"placeholder" in field ? field.placeholder : undefined}
            maxLength={"maxLength" in field ? field.maxLength : undefined}
            autoComplete={"autoComplete" in field ? field.autoComplete : field.kind === "email" ? "email" : undefined}
            min={field.kind === "date" ? addDaysIST(field.minDays) : undefined}
            max={field.kind === "date" ? maxBookingDateIST() : undefined}
            onChange={(e) => onChange(key, e.target.value)}
          />
          <Help field={field} />
          <ErrorText k={key} error={error} />
        </div>
      );
    }

    case "amount":
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 mt-[3px] -translate-y-1/2 text-neutral-500">₹</span>
            <input
              {...common}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className={`${control} pl-7`}
              value={formatIndianDigits(value)}
              onChange={(e) => onChange(key, e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9))}
            />
          </div>
          <Help field={field} />
          <ErrorText k={key} error={error} />
        </div>
      );

    case "textarea":
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <textarea
            {...common}
            rows={field.rows ?? 4}
            className={control}
            value={value}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            onChange={(e) => onChange(key, e.target.value)}
          />
          <Help
            field={field}
            extra={
              field.counter ? (
                <span aria-live="polite" className="shrink-0 tabular-nums">
                  {value.trim().length.toLocaleString("en-IN")} / {field.maxLength.toLocaleString("en-IN")}
                </span>
              ) : undefined
            }
          />
          <ErrorText k={key} error={error} />
        </div>
      );

    case "select":
      return (
        <div>
          <Label field={field} htmlFor={id} />
          <select {...common} className={control} value={value} onChange={(e) => onChange(key, e.target.value || undefined)}>
            <option value="">Choose…</option>
            {field.options.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <Help field={field} />
          <ErrorText k={key} error={error} />
        </div>
      );

    case "radio":
    case "chips": {
      const multi = field.kind === "chips";
      const selected = multi ? (Array.isArray(raw) ? raw : []) : [value];
      return (
        <fieldset
          id={id}
          tabIndex={-1}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="focus:outline-none"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur(key);
          }}
        >
          <Label field={field} as="legend" />
          <div className={multi ? "mt-2 flex flex-wrap gap-2" : "mt-2 grid gap-2"}>
            {field.options.map(([v, label]) => {
              const on = selected.includes(v);
              return (
                <label
                  key={v}
                  className={
                    multi
                      ? `cursor-pointer rounded-full border px-3.5 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neutral-900/30 ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-500"}`
                      : `flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 text-sm ${on ? "border-neutral-900 bg-neutral-50" : "border-neutral-300 bg-white"}`
                  }
                >
                  <input
                    type={multi ? "checkbox" : "radio"}
                    name={key}
                    value={v}
                    checked={on}
                    className={multi ? "sr-only" : "mt-0.5 accent-neutral-900"}
                    onChange={(e) => {
                      if (!multi) return onChange(key, v);
                      const next = e.target.checked ? [...selected, v] : selected.filter((s) => s !== v);
                      onChange(key, field.options.map(([o]) => o).filter((o) => next.includes(o)));
                    }}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
          <Help field={field} />
          <ErrorText k={key} error={error} />
        </fieldset>
      );
    }

    case "file":
      return (
        <div>
          <Label field={field} htmlFor={id} />
          {file?.status === "done" ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-neutral-800">
              <span>
                Uploaded: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </span>
              <button type="button" className="underline" onClick={() => onFile?.(null)}>
                Remove
              </button>
            </p>
          ) : (
            <input
              id={id}
              name={key}
              type="file"
              accept={UPLOAD_MIME_TYPES.join(",")}
              aria-invalid={file?.status === "error"}
              aria-describedby={[file?.status === "error" ? errorId(key) : null, helpId(key)].filter(Boolean).join(" ")}
              disabled={file?.status === "uploading"}
              className="mt-1.5 block w-full text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-2 file:text-sm"
              onChange={(e) => {
                onFile?.(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          )}
          {file?.status === "uploading" && <p className="mt-1 text-sm text-neutral-600">Uploading {file.name}…</p>}
          <Help field={field} />
          {file?.status === "error" && (
            <div id={errorId(key)} className="mt-1 flex flex-wrap items-center gap-3 text-sm text-red-600">
              <span>{file.message}</span>
              {file.canRetry && (
                <button type="button" className="font-medium underline" onClick={onRetryFile}>
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      );
  }
}
