"use client";

/**
 * Scène « AI Core » — hero cinématique de la landing.
 *
 * Un cœur de lumière en particules 3D (sphère + double anneau orbital) qui
 * dérive lentement dans une atmosphère sombre : projection perspective faite
 * main, blending additif pour le glow, poussière d'ambiance, parallaxe souris,
 * pulsation lente. Canvas 2D pur — zéro dépendance, ~60 fps.
 *
 * Respect strict de prefers-reduced-motion : rendu d'UNE frame statique.
 * Le rAF est coupé quand l'onglet est caché ou le hero hors viewport.
 */

import { useEffect, useRef } from "react";

interface P {
  // position sur la forme (repère objet)
  x: number; y: number; z: number;
  // taille et teinte de base
  s: number; hue: number;
  // scintillement
  tw: number; ph: number;
}

export function AiCoreScene({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.innerWidth < 640;

    let W = 0, H = 0, dpr = 1;
    const fit = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();

    // ── Particules ────────────────────────────────────────────────────────
    const N_CORE = isMobile ? 420 : 900;    // sphère centrale
    const N_RING = isMobile ? 260 : 620;    // anneaux orbitaux
    const N_DUST = isMobile ? 60 : 140;     // poussière d'ambiance
    const parts: P[] = [];

    // Sphère : distribution de Fibonacci (uniforme, organique)
    const GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N_CORE; i++) {
      const t = i / N_CORE;
      const inc = Math.acos(1 - 2 * t);
      const az = GA * i;
      // léger bruit radial : cristal vivant, pas une bille parfaite
      const r = 1 + (Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 4.1414) * 0.5) * 0.16;
      parts.push({
        x: r * Math.sin(inc) * Math.cos(az),
        y: r * Math.cos(inc),
        z: r * Math.sin(inc) * Math.sin(az),
        s: 0.7 + ((i * 7919) % 100) / 100 * 1.1,
        hue: 196 + ((i * 104729) % 100) / 100 * 18,
        tw: 0.5 + ((i * 15485863) % 100) / 100 * 1.4,
        ph: ((i * 32452843) % 628) / 100,
      });
    }
    // Deux anneaux inclinés (l'orbite = signature Prompta)
    for (let i = 0; i < N_RING; i++) {
      const a = (i / N_RING) * Math.PI * 2;
      const ring = i % 2;
      const rr = ring ? 1.75 : 2.15;
      const jitter = (((i * 2654435761) % 100) / 100 - 0.5) * 0.1;
      const tilt = ring ? 0.42 : -0.3;
      const y0 = Math.sin(a) * Math.sin(tilt) * rr;
      const x0 = Math.cos(a) * rr;
      const z0 = Math.sin(a) * Math.cos(tilt) * rr;
      parts.push({
        x: x0 + jitter, y: y0 * 0.6 + jitter, z: z0 + jitter,
        s: 0.5 + ((i * 7919) % 100) / 100 * 0.9,
        hue: 199 + ((i * 104729) % 100) / 100 * 14,
        tw: 0.8 + ((i * 15485863) % 100) / 100 * 1.6,
        ph: ((i * 32452843) % 628) / 100,
      });
    }
    // Poussière lointaine (fixe à l'écran, très faible)
    const dust = Array.from({ length: N_DUST }, (_, i) => ({
      x: ((i * 7919) % 1000) / 1000,
      y: ((i * 104729) % 1000) / 1000,
      s: 0.4 + ((i * 15485863) % 100) / 100 * 0.9,
      a: 0.05 + ((i * 32452843) % 100) / 100 * 0.12,
      ph: ((i * 96769) % 628) / 100,
    }));

    // ── Rendu ─────────────────────────────────────────────────────────────
    let mx = 0, my = 0;           // parallaxe souris (lissée)
    let tmx = 0, tmy = 0;
    const onMove = (e: MouseEvent) => {
      tmx = (e.clientX / window.innerWidth - 0.5) * 2;
      tmy = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!reduced && !isMobile) window.addEventListener("mousemove", onMove, { passive: true });

    const draw = (t: number) => {
      const time = t / 1000;
      mx += (tmx - mx) * 0.04;
      my += (tmy - my) * 0.04;

      ctx.clearRect(0, 0, W, H);

      // Poussière d'ambiance (derrière, blending normal)
      ctx.globalCompositeOperation = "source-over";
      for (const d of dust) {
        const a = d.a * (0.6 + 0.4 * Math.sin(time * 0.7 + d.ph));
        ctx.fillStyle = `rgba(148, 197, 233, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(d.x * W, d.y * H, d.s, 0, 6.283);
        ctx.fill();
      }

      // Cœur : projection 3D + glow additif
      ctx.globalCompositeOperation = "lighter";
      const cx = W / 2 + mx * 14;
      const cy = H / 2 + my * 10;
      const scale = Math.min(W, H) * 0.19;
      const ry = time * 0.12;                       // rotation lente Y
      const rx = 0.35 + Math.sin(time * 0.05) * 0.1 + my * 0.06; // bascule X
      const pulse = 1 + Math.sin(time * 0.6) * 0.025;            // respiration
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const cosX = Math.cos(rx), sinX = Math.sin(rx);

      for (const p of parts) {
        // rotation Y puis X
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y1 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        // perspective
        const persp = 3.6 / (3.6 + z2);
        const sx = cx + x1 * scale * pulse * persp;
        const sy = cy + y1 * scale * pulse * persp;
        // scintillement + profondeur (les particules du fond s'estompent)
        const depth = Math.max(0.08, Math.min(1, (persp - 0.62) * 2.4));
        const twinkle = 0.55 + 0.45 * Math.sin(time * p.tw + p.ph);
        const alpha = 0.34 * depth * twinkle;
        const size = p.s * persp * (isMobile ? 1.1 : 1.35);

        ctx.fillStyle = `hsla(${p.hue}, 95%, ${62 + depth * 14}%, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, 6.283);
        ctx.fill();
        // halo doux des particules proches : le « glow » du cristal
        if (depth > 0.75 && p.s > 1.2) {
          ctx.fillStyle = `hsla(${p.hue}, 95%, 70%, ${(alpha * 0.28).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, size * 3.2, 0, 6.283);
          ctx.fill();
        }
      }

      // Lueur centrale (le cœur respire)
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 2.4);
      g.addColorStop(0, `rgba(56, 189, 248, ${0.10 * pulse})`);
      g.addColorStop(0.5, "rgba(56, 189, 248, 0.03)");
      g.addColorStop(1, "rgba(56, 189, 248, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - scale * 2.4, cy - scale * 2.4, scale * 4.8, scale * 4.8);
    };

    if (reduced) {
      // Une seule frame posée — pas d'animation.
      draw(8000);
      const onResize = () => { fit(); draw(8000); };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    let raf = 0;
    let running = true;
    const loop = (t: number) => {
      if (running) draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Économie : pause hors viewport / onglet caché.
    const io = new IntersectionObserver(([e]) => { running = e.isIntersecting; });
    io.observe(canvas);
    const onVis = () => { running = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", onVis);
    const onResize = () => fit();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
