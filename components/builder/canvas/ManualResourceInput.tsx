"use client";

import type { ParamScope } from "@/lib/connectors/types";
import {
  isResourcePlaceholder,
  resourcePlaceholder,
} from "@/lib/connectors/param-bindings";
import { ResourceSelect } from "@/components/connectors/ResourceSelect";

export type ResourceVisibility = "client" | "builder_private" | "builder_shared";

interface Props {
  resourceType: string;
  label: string;
  value: string;
  pinned: boolean;
  visibility: ResourceVisibility;
  disabled?: boolean;
  onChange: (value: string, pinned: boolean, visibility: ResourceVisibility) => void;
  /** Connecteur — permet d'auto-lister les ressources du compte du builder. */
  connectorId?: string;
  /** Valeur de la ressource parente (ex. spreadsheetId pour lister les onglets). */
  dependsOnValue?: string;
}

function visibilityFromMeta(
  pinned: boolean,
  value: string,
  scope?: ParamScope,
  shared?: boolean,
): ResourceVisibility {
  if (!pinned || isResourcePlaceholder(value)) return "client";
  if (shared) return "builder_shared";
  if (scope === "builder_test") return "builder_private";
  return "builder_private";
}

export function resolveResourceVisibility(
  pinned: boolean,
  value: string,
  paramMeta?: { scope?: ParamScope; shared?: boolean },
): ResourceVisibility {
  return visibilityFromMeta(pinned, value, paramMeta?.scope, paramMeta?.shared);
}

export function ManualResourceInput({
  resourceType,
  label,
  value,
  pinned,
  visibility,
  disabled = false,
  onChange,
  connectorId,
  dependsOnValue,
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
              onChange(resourcePlaceholder(resourceType), false, "client");
            } else {
              onChange("", true, "builder_private");
            }
          }}
        />
        Définir une valeur précise — {label}
      </label>

      {pinned && (
        <>
          {connectorId && !disabled ? (
            <ResourceSelect
              connectorId={connectorId}
              resourceType={resourceType}
              value={isResourcePlaceholder(value) ? "" : value}
              parentValue={dependsOnValue}
              label={label}
              onChange={(id) => onChange(id.trim(), true, visibility)}
            />
          ) : (
            <input
              value={isResourcePlaceholder(value) ? "" : value}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value.trim(), true, visibility)}
              placeholder={resourceType}
              className="h-8 w-full rounded border border-line px-2 font-mono text-xs"
            />
          )}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-ink-soft">Visibilité de cette ressource</p>
            <div className="flex flex-col gap-1">
              {(
                [
                  {
                    id: "builder_private" as const,
                    label: "🔒 Personnel (builder)",
                    hint: "Votre ID — utilisé à la vente uniquement si vous ne publiez pas en partagé",
                  },
                  {
                    id: "builder_shared" as const,
                    label: "🌐 Public (partagé)",
                    hint: "Tous les abonnés utiliseront cette ressource",
                  },
                  {
                    id: "client" as const,
                    label: "👤 Chaque client renseigne",
                    hint: "Placeholder au run — le client saisit le sien",
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
                    name={`vis-${resourceType}-${label}`}
                    className="mr-1.5"
                    checked={visibility === opt.id}
                    disabled={disabled}
                    onChange={() => {
                      if (opt.id === "client") {
                        onChange(resourcePlaceholder(resourceType), false, "client");
                      } else {
                        onChange(
                          isResourcePlaceholder(value) ? "" : value,
                          true,
                          opt.id,
                        );
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
          Au run, le client saisira : {resourcePlaceholder(resourceType)}
        </p>
      )}
    </div>
  );
}
