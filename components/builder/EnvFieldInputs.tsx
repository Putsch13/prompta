"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, HelpCircle, Link2, FileText } from "lucide-react";
import {
  enrichEnvField,
  CONNECTOR_PLAYGROUND_HINTS,
  type EnvFieldBase,
} from "@/lib/builder/env-field-hints";
import {
  filterInputsForProvisioning,
  type ProvisioningMode,
} from "@/lib/builder/provisioning";

interface Props {
  fields: EnvFieldBase[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  requiredConnectors?: string[];
  provisioningMode?: ProvisioningMode;
  title?: string;
  showConnectorBanner?: boolean;
}

interface DocOption {
  id: string;
  name: string;
}

export function EnvFieldInputs({
  fields,
  values,
  onChange,
  requiredConnectors = [],
  provisioningMode = "manual",
  title = "Paramètres de test",
  showConnectorBanner = true,
}: Props) {
  const visible = filterInputsForProvisioning(
    fields.filter((f) => f.key),
    provisioningMode
  );
  if (visible.length === 0 && requiredConnectors.length === 0) return null;

  const connectorHints = requiredConnectors
    .map((id) => CONNECTOR_PLAYGROUND_HINTS[id])
    .filter(Boolean);

  return (
    <div className="mt-4 space-y-4">
      {showConnectorBanner && (connectorHints.length > 0 || visible.length > 0) && (
        <div className="rounded-xl border border-accent/25 bg-accent/5 p-4 text-sm">
          <p className="font-medium text-ink">Avant de tester</p>
          <p className="mt-1 text-xs text-ink-soft">
            Les champs ci-dessous sont vos <strong>paramètres métier</strong> (région, feuille
            Google Sheets, message…). Les comptes Gmail, Sheets, Slack, etc. se connectent
            séparément — vous n&apos;avez pas besoin de mot de passe ici.
          </p>
          {connectorHints.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              {requiredConnectors.map((id) => {
                const hint = CONNECTOR_PLAYGROUND_HINTS[id];
                if (!hint) return null;
                return (
                  <li key={id} className="flex items-start gap-1.5">
                    <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <span>
                      <strong>{hint.label}</strong> — {hint.hint}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {provisioningMode === "managed" && visible.length < fields.filter((f) => f.key).length && (
            <p className="mt-2 text-xs text-violet-700">
              Mode clé en main : l&apos;agent créera automatiquement la feuille Google Sheets et
              les ressources techniques. Vous ne renseignez que le métier.
            </p>
          )}
          <Link
            href="/dashboard/connexions"
            className="mt-2 inline-flex text-xs font-medium text-accent hover:underline"
          >
            Ouvrir mes connexions →
          </Link>
        </div>
      )}

      {visible.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{title}</p>
          {visible.map((field) => (
            <EnvFieldRow
              key={field.key}
              field={field}
              value={values[field.key] ?? ""}
              onChange={(v) => onChange(field.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EnvFieldRow({
  field,
  value,
  onChange,
}: {
  field: EnvFieldBase;
  value: string;
  onChange: (value: string) => void;
}) {
  const [showHint, setShowHint] = useState(false);
  const [documents, setDocuments] = useState<DocOption[]>([]);
  const enriched = enrichEnvField(field);
  const inputType =
    enriched.type === "number" ? "number" : enriched.inputMode === "email" ? "email" : "text";

  const isDocumentField =
    enriched.type === "file" ||
    /document|fichier|file|pdf|contrat|brief/i.test(`${field.key} ${field.label}`);

  useEffect(() => {
    if (!isDocumentField) return;
    fetch("/api/account/documents")
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((d) =>
        setDocuments(
          (d.documents ?? []).map((doc: DocOption) => ({ id: doc.id, name: doc.name }))
        )
      )
      .catch(() => undefined);
  }, [isDocumentField]);

  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <label className="text-sm font-medium text-ink">
          {enriched.label || enriched.key}
          {enriched.required && <span className="text-destructive"> *</span>}
        </label>
        {enriched.hintTitle && (
          <button
            type="button"
            onClick={() => setShowHint((o) => !o)}
            className="flex shrink-0 items-center gap-0.5 text-[11px] text-accent hover:underline"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {showHint ? "Masquer" : "Aide"}
            <ChevronDown
              className={`h-3 w-3 transition ${showHint ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {enriched.help && (
        <p className="mt-1 text-xs text-ink-soft">{enriched.help}</p>
      )}

      {showHint && enriched.hintDetail && (
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-card2 p-2.5 font-sans text-[11px] leading-relaxed text-ink-soft">
          {enriched.hintDetail}
        </pre>
      )}

      {enriched.example && !showHint && !isDocumentField && (
        <p className="mt-1 font-mono text-[10px] text-ink-faint">
          Ex. {enriched.example}
        </p>
      )}

      {isDocumentField ? (
        <div className="mt-2 space-y-2">
          {documents.length > 0 ? (
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm"
            >
              <option value="">— Choisir un document —</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-ink-soft">
              Aucun document — uploadez-en un dans{" "}
              <Link href="/dashboard/documents" className="text-accent hover:underline">
                Mes documents
              </Link>
              .
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <FileText className="h-3.5 w-3.5" />
            <span>Ou collez l&apos;ID document :</span>
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="UUID du document"
            className="h-10 w-full rounded-lg border border-line px-3 font-mono text-xs"
          />
        </div>
      ) : enriched.type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={enriched.placeholder}
          className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm"
        />
      ) : (
        <input
          type={inputType}
          inputMode={enriched.inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={enriched.placeholder}
          className="mt-2 h-10 w-full rounded-lg border border-line px-3 text-sm"
        />
      )}
    </div>
  );
}
