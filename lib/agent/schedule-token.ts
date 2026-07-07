/**
 * Plannings d'agents — format simple et lisible stocké dans
 * scheduled_runs.cron_expression :
 *   `daily@HH:MM`     → chaque jour à HH:MM (heure de Paris)
 *   `weekly:D@HH:MM`  → chaque semaine le jour D (0=dim … 6=sam) à HH:MM
 *
 * Volontairement PAS de cron complet : deux presets couvrent l'usage réel
 * (« chaque lundi 9h », « tous les jours 8h ») sans erreur de syntaxe possible.
 */

export interface SchedulePreset {
  kind: "daily" | "weekly";
  /** 0=dimanche … 6=samedi (weekly uniquement). */
  day?: number;
  /** "HH:MM" — heure de Paris. */
  time: string;
}

const DAY_LABELS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export function parseScheduleToken(token: string | null | undefined): SchedulePreset | null {
  if (!token) return null;
  const daily = token.match(/^daily@(\d{2}):(\d{2})$/);
  if (daily) return { kind: "daily", time: `${daily[1]}:${daily[2]}` };
  const weekly = token.match(/^weekly:([0-6])@(\d{2}):(\d{2})$/);
  if (weekly) return { kind: "weekly", day: Number(weekly[1]), time: `${weekly[2]}:${weekly[3]}` };
  return null;
}

export function formatScheduleToken(p: SchedulePreset): string {
  return p.kind === "daily" ? `daily@${p.time}` : `weekly:${p.day ?? 1}@${p.time}`;
}

export function describeSchedule(p: SchedulePreset): string {
  return p.kind === "daily"
    ? `Chaque jour à ${p.time}`
    : `Chaque ${DAY_LABELS[p.day ?? 1]} à ${p.time}`;
}

/** Date « vue de Paris » (les composantes locales reflètent Europe/Paris). */
function parisView(d: Date): Date {
  return new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
}

/**
 * Prochaine occurrence STRICTEMENT future du preset (heure de Paris).
 * Retourne un vrai instant UTC.
 */
export function nextOccurrence(p: SchedulePreset, from = new Date()): Date {
  const [hh, mm] = p.time.split(":").map(Number);
  const paris = parisView(from);
  const target = new Date(paris);
  target.setHours(hh, mm, 0, 0);

  if (p.kind === "daily") {
    if (target <= paris) target.setDate(target.getDate() + 1);
  } else {
    const wanted = p.day ?? 1;
    let delta = (wanted - target.getDay() + 7) % 7;
    if (delta === 0 && target <= paris) delta = 7;
    target.setDate(target.getDate() + delta);
  }

  // Décalage « vue Paris » → instant réel : on applique la différence au `from`.
  return new Date(from.getTime() + (target.getTime() - paris.getTime()));
}
