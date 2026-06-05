"use client";

import type { RunResourceField } from "@/lib/connectors/extract-run-resources";
import { resourceInputKey } from "@/lib/connectors/extract-run-resources";
import {
  resourceInputHint,
  resourceInputPlaceholder,
} from "@/lib/connectors/resource-input-hints";

interface Props {
  fields: RunResourceField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

export function RunResourceFields({ fields, values, onChange }: Props) {
  if (fields.length === 0) return null;

  function setFieldValue(field: RunResourceField, id: string) {
    onChange({ ...values, [resourceInputKey(field)]: id });
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-card2 p-3">
      <p className="text-xs font-medium text-ink-soft">Ressources à renseigner</p>
      {fields.map((field) => {
        const parentField = field.dependsOnKey
          ? fields.find(
              (f) => f.stepIndex === field.stepIndex && f.paramKey === field.dependsOnKey,
            )
          : undefined;
        const parentValue = parentField ? values[resourceInputKey(parentField)] : undefined;

        if (field.dependsOnKey && !parentValue) {
          return (
            <div key={field.id}>
              <label className="text-[10px] text-ink-faint">{field.label}</label>
              <p className="mt-1 text-[10px] text-ink-faint">
                Renseignez d&apos;abord : {parentField?.label ?? field.dependsOnKey}.
              </p>
            </div>
          );
        }

        return (
          <div key={field.id}>
            <label className="text-[10px] font-medium text-ink-soft">{field.label}</label>
            <p className="mt-0.5 text-[10px] text-ink-faint">{resourceInputHint(field.resourceType)}</p>
            <input
              value={values[resourceInputKey(field)] ?? ""}
              onChange={(e) => setFieldValue(field, e.target.value.trim())}
              placeholder={resourceInputPlaceholder(field.resourceType)}
              className="mt-1 h-9 w-full rounded border border-line bg-card px-2 font-mono text-xs"
            />
          </div>
        );
      })}
    </div>
  );
}
