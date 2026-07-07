"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Copy, Loader2, Webhook, X } from "lucide-react";

interface ScheduleData {
  kind: "daily" | "weekly";
  day?: number;
  time: string;
  label: string;
  nextRunAt?: string | null;
}

interface WebhookData {
  url: string;
  secret: string | null;
  signatureHeader: string;
}

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/**
 * Planification (« chaque lundi 9h ») + URL webhook d'un agent en production.
 * S'affiche replié sous la carte agent.
 */
export function AgentSchedulePanel({
  agentId,
  onScheduleChange,
}: {
  agentId: string;
  onScheduleChange?: (label: string | null) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [webhook, setWebhook] = useState<WebhookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "secret" | null>(null);

  // Formulaire local
  const [kind, setKind] = useState<"off" | "daily" | "weekly">("off");
  const [day, setDay] = useState(1);
  const [time, setTime] = useState("09:00");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/schedule`);
        const data = await res.json();
        if (res.ok) {
          setSchedule(data.schedule);
          setWebhook(data.webhook);
          if (data.schedule) {
            setKind(data.schedule.kind);
            setDay(data.schedule.day ?? 1);
            setTime(data.schedule.time);
          }
        } else {
          setError(data.error ?? "Chargement impossible");
        }
      } catch {
        setError("Chargement impossible");
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (kind === "off") {
        await fetch(`/api/agents/${agentId}/schedule`, { method: "DELETE" });
        setSchedule(null);
        onScheduleChange?.(null);
      } else {
        const res = await fetch(`/api/agents/${agentId}/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, day, time }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Enregistrement impossible");
          return;
        }
        setSchedule(data.schedule);
        onScheduleChange?.(data.schedule.label);
      }
    } finally {
      setSaving(false);
    }
  }

  async function copy(text: string, which: "url" | "secret") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard indisponible */
    }
  }

  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-card2/60 px-3 py-2.5 text-xs text-ink-soft">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement de la planification…
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-line bg-card2/60 p-3">
      {/* ── Planning récurrent ── */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Clock className="h-3.5 w-3.5 text-accent" /> Lancement automatique
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="h-8 rounded-lg border border-line bg-card px-2 text-xs"
          >
            <option value="off">Désactivé</option>
            <option value="daily">Chaque jour</option>
            <option value="weekly">Chaque semaine</option>
          </select>
          {kind === "weekly" && (
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="h-8 rounded-lg border border-line bg-card px-2 text-xs"
            >
              {DAYS.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          )}
          {kind !== "off" && (
            <>
              <span className="text-xs text-ink-faint">à</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-8 rounded-lg border border-line bg-card px-2 text-xs"
              />
              <span className="text-[10px] text-ink-faint">(heure de Paris)</span>
            </>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Enregistrer
          </button>
        </div>
        {schedule?.nextRunAt && kind !== "off" && (
          <p className="mt-1.5 text-[11px] text-emerald-700">
            ⏰ {schedule.label} — prochain lancement :{" "}
            {new Date(schedule.nextRunAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
        {error && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-destructive">
            <X className="h-3 w-3" /> {error}
          </p>
        )}
      </div>

      {/* ── Webhook ── */}
      {webhook && (
        <div className="border-t border-line pt-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Webhook className="h-3.5 w-3.5 text-accent" /> Déclenchement par webhook
          </p>
          <p className="mb-2 text-[11px] text-ink-faint">
            POST sur cette URL déclenche l&apos;agent (le corps JSON devient ses entrées).
            Signature HMAC-SHA256 du corps dans l&apos;en-tête{" "}
            <code className="rounded bg-line/60 px-1">{webhook.signatureHeader}</code>.
          </p>
          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-card px-2 py-1.5 font-mono text-[10px] text-ink-soft">
              {webhook.url}
            </code>
            <button
              type="button"
              onClick={() => void copy(webhook.url, "url")}
              className="shrink-0 rounded-lg border border-line p-1.5 text-ink-soft hover:bg-card"
              title="Copier l'URL"
            >
              {copied === "url" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          {webhook.secret && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-card px-2 py-1.5 font-mono text-[10px] text-ink-faint">
                secret : {webhook.secret.slice(0, 8)}…
              </code>
              <button
                type="button"
                onClick={() => void copy(webhook.secret!, "secret")}
                className="shrink-0 rounded-lg border border-line p-1.5 text-ink-soft hover:bg-card"
                title="Copier le secret"
              >
                {copied === "secret" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
