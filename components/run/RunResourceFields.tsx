"use client";

import type { RunResourceField } from "@/lib/connectors/extract-run-resources";
import { resourceInputKey } from "@/lib/connectors/extract-run-resources";
import { ResourceSelect } from "@/components/connectors/ResourceSelect";

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
      <p className="text-xs font-medium text-ink-soft">Ressources à choisir</p>
      {fields.map((field) => {
        const parentField = field.dependsOnKey
          ? fields.find(
              (f) => f.stepIndex === field.stepIndex && f.paramKey === field.dependsOnKey,
            )
          : undefined;
        const parentValue = parentField ? values[resourceInputKey(parentField)] : undefined;
        const dependsBlocked = Boolean(field.dependsOnKey && !parentValue);

        return (
          <div key={field.id}>
            <label className="text-[10px] font-medium text-ink-soft">{field.label}</label>
            {dependsBlocked ? (
              <p className="mt-1 text-[10px] text-ink-faint">
                Renseignez d&apos;abord : {parentField?.label ?? field.dependsOnKey}.
              </p>
            ) : (
              <div className="mt-1">
                <ResourceSelect
                  connectorId={field.connectorId}
                  resourceType={field.resourceType}
                  value={values[resourceInputKey(field)] ?? ""}
                  parentValue={parentValue}
                  label={field.label}
                  onChange={(id) => setFieldValue(field, id)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
