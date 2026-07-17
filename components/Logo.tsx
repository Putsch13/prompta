/**
 * Logo Prompta — DA « AI Core » : P dans un anneau-viseur lumineux.
 * L'arc externe tourne lentement (désactivable via animate={false}).
 */
export function Logo({
  size = 28,
  animate = true,
  className = "",
}: {
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: "drop-shadow(0 0 6px rgba(56,189,248,0.55))" }}
      >
        {/* Anneau externe fin */}
        <circle cx="24" cy="24" r="22" stroke="#1E7FC2" strokeWidth="1.5" opacity="0.45" />
        {/* Arc lumineux rotatif */}
        <g className={animate ? "origin-center animate-ring-spin" : undefined}>
          <path
            d="M24 2 A22 22 0 0 1 45.4 18.6"
            stroke="#38BDF8"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="24" cy="2" r="1.6" fill="#67D0FF" />
        </g>
        {/* Graduations */}
        {[45, 135, 225, 315].map((a) => (
          <line
            key={a}
            x1={24 + 19 * Math.cos((a * Math.PI) / 180)}
            y1={24 + 19 * Math.sin((a * Math.PI) / 180)}
            x2={24 + 22 * Math.cos((a * Math.PI) / 180)}
            y2={24 + 22 * Math.sin((a * Math.PI) / 180)}
            stroke="#38BDF8"
            strokeWidth="1.2"
            opacity="0.6"
          />
        ))}
        {/* P central */}
        <path
          d="M18 34 V14 h7.5 a6.5 6.5 0 0 1 0 13 H18"
          stroke="#E4EDF9"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Wordmark complet : logo + « Prompta » (usage header / footer). */
export function LogoWordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className="font-display text-xl font-bold tracking-tight text-ink">
        Prompta
      </span>
    </span>
  );
}
