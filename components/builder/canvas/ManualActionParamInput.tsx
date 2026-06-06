"use client";

import type { ParamScope } from "@/lib/connectors/types";
import { isParamBinding } from "@/lib/connectors/param-bindings";
import type { ResourceVisibility } from "./ManualResourceInput";

interface Props {
  label: string;
  value: string;
  bindingKey: string;
  placeholder?: string;
  pinned: boolean;
  visibility: ResourceVisibility;
  disabled?: boolean;
  onChange: (value: string, pinned: boolean, visibility: ResourceVisibility) => void;
}

function bindingPlaceholder(key: string): string {
  return `{{${key}}}`;
}

export function resolveParamVisibility(
  pinned: boolean,
  value: string,
  paramMeta?: { scope?: ParamScope; shared?: boolean },
): ResourceVisibility {
  if (!pinned || isParamBinding(value)) return "client";
  if (paramMeta?.shared) return "builder_shared";
  return "builder_private";
}

export function ManualActionParamInput({
  label,
  value,
  bindingKey,
  placeholder,
  pinned,
  visibility,
  disabled = false,
  onChange,
}: Props) {
  return (
    <div className="space-y-2 rounded-lg border border-line bg-card2 p-2">
      <label className="flex items-center gap-2 text-[10px] text-ink-soft">
        <input
          type="checkbox"
          checked={pinned}
          disabled={disabled}
          onChange={(e) => {
            const on = e.target.checked;
            if (!on) {
              onChange(bindingPlaceholder(bindingKey), false, "client");
            } else {
              onChange("", true, "builder_private");
            }
          }}
        />
        Définir une valeur précise — {label}
      </label>

      {pinned && (
        <>
          <input
            value={isParamBinding(value) ? "" : value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value, true, visibility)}
            placeholder={placeholder ?? label}
            className="h-8 w-full rounded border border-line px-2 font-mono text-xs"
          />
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-ink-soft">Visibilité</p>
            <div className="flex flex-col gap-1">
              {(
                [
                  {
                    id: "builder_private" as const,
                    label: "🔒 Personnel (builder)",
                    hint: "Votre valeur — utilisée en test",
                  },
                  {
                    id: "builder_shared" as const,
                    label: "🌐 Public (partagé)",
                    hint: "Tous les abonnés utiliseront cette valeur",
                  },
                  {
                    id: "client" as const,
                    label: "👤 Chaque client renseigne",
                    hint: "Demande au run avec la clé de binding",
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.id}
                  className={`cursor-pointer rounded border px-2 py-1.5 text-[10px] ${
                    visibility === opt.id
                      ? "border-accent bg-accent/5 text-ink"
                      : "border-line text-ink-soft"
                  }`}
                >
                  <input
                    type="radio"
                    name={`param-vis-${bindingKey}`}
                    className="mr-1.5"
                    checked={visibility === opt.id}
                    disabled={disabled}
                    onChange={() => {
                      if (opt.id === "client") {
                        onChange(bindingPlaceholder(bindingKey), false, "client");
                      } else {
                        onChange(isParamBinding(value) ? "" : value, true, opt.id);
                      }
                    }}
                  />
                  <span className="font-medium">{opt.label}</span>
                  <span className="mt-0.5 block text-ink-faint">{opt.hint}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {!pinned && (
        <p className="text-[10px] text-ink-faint">
          Au run, le client renseignera : {bindingPlaceholder(bindingKey)}
        </p>
      )}
    </div>
  );
}
