"use client";

import type { ParamScope } from "@/lib/connectors/types";
import { isParamBinding } from "@/lib/connectors/param-bindings";

export type OptionalParamMode = "default" | "precise" | "client";

interface Props {
  label: string;
  value: string;
  defaultValue: string;
  defaultHint: string;
  bindingKey: string;
  placeholder?: string;
  onChange: (
    value: string,
    mode: OptionalParamMode,
    meta: { scope: ParamScope; shared?: boolean },
  ) => void;
}

function detectMode(value: string, defaultValue: string): OptionalParamMode {
  if (isParamBinding(value)) return "client";
  if (!value?.trim() || value === defaultValue) return "default";
  return "precise";
}

export function OptionalActionParamInput({
  label,
  value,
  defaultValue,
  defaultHint,
  bindingKey,
  placeholder,
  onChange,
}: Props) {
  const mode = detectMode(value, defaultValue);

  return (
    <div className="space-y-2 rounded-lg border border-line bg-card2 p-2">
      <p className="text-[10px] font-medium text-ink-soft">{label}</p>
      <div className="flex flex-col gap-1">
        <label
          className={`cursor-pointer rounded border px-2 py-1.5 text-[10px] ${
            mode === "default" ? "border-accent bg-accent/5 text-ink" : "border-line text-ink-soft"
          }`}
        >
          <input
            type="radio"
            name={`opt-${bindingKey}`}
            className="mr-1.5"
            checked={mode === "default"}
            onChange={() => onChange(defaultValue, "default", { scope: "builder_test", shared: false })}
          />
          <span className="font-medium">Par défaut — {defaultHint}</span>
        </label>

        <label
          className={`cursor-pointer rounded border px-2 py-1.5 text-[10px] ${
            mode === "precise" ? "border-accent bg-accent/5 text-ink" : "border-line text-ink-soft"
          }`}
        >
          <input
            type="radio"
            name={`opt-${bindingKey}`}
            className="mr-1.5"
            checked={mode === "precise"}
            onChange={() => onChange("", "precise", { scope: "builder_test", shared: false })}
          />
          <span className="font-medium">Valeur précise (builder)</span>
        </label>

        <label
          className={`cursor-pointer rounded border px-2 py-1.5 text-[10px] ${
            mode === "client" ? "border-accent bg-accent/5 text-ink" : "border-line text-ink-soft"
          }`}
        >
          <input
            type="radio"
            name={`opt-${bindingKey}`}
            className="mr-1.5"
            checked={mode === "client"}
            onChange={() =>
              onChange(`{{${bindingKey}}}`, "client", { scope: "end_user", shared: false })
            }
          />
          <span className="font-medium">Demander au client au run</span>
        </label>
      </div>

      {mode === "precise" && (
        <input
          value={isParamBinding(value) || value === defaultValue ? "" : value}
          onChange={(e) =>
            onChange(e.target.value, "precise", { scope: "builder_test", shared: false })
          }
          placeholder={placeholder ?? label}
          className="h-8 w-full rounded border border-line px-2 font-mono text-xs"
        />
      )}

      {mode === "client" && (
        <p className="text-[10px] text-ink-faint">
          Clé au run : {`{{${bindingKey}}}`} (sinon défaut si non renseigné)
        </p>
      )}
    </div>
  );
}
