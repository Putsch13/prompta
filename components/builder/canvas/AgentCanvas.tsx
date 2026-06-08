"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Code,
  GitBranch,
  Maximize2,
  MessageSquare,
  Search,
  Shield,
  Workflow,
  ZoomIn,
  ZoomOut,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { AgentFlowPreview } from "@/components/builder/AgentFlowPreview";
import { getNodeVisual } from "@/lib/catalogs/connector-visuals";
import { graphToSteps, type PlanGraph, type PlanNode } from "@/lib/builder/plan-graph";

const LUCIDE_MAP: Record<string, LucideIcon> = {
  MessageSquare,
  Search,
  Code,
  GitBranch,
  Shield,
  Zap,
  Bot,
};

interface Props {
  graph: PlanGraph | null;
  selectedId?: string;
  onSelect: (id: string | null) => void;
  onMoveNode?: (id: string, x: number, y: number) => void;
  highlightedIds?: string[];
  readOnly?: boolean;
  loading?: boolean;
  validationIssues?: { nodeId?: string; level: string; message: string }[];
  disconnectedConnectors?: string[];
}

const NODE_W = 176;
const NODE_H = 88;

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

function bezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fanOffset = 0,
): string {
  const sx = x1 + NODE_W;
  const sy = y1 + NODE_H / 2 + fanOffset;
  const ex = x2;
  const ey = y2 + NODE_H / 2;
  const cx1 = sx + Math.max(60, (ex - sx) * 0.45);
  const cx2 = ex - Math.max(60, (ex - sx) * 0.45);
  return `M ${sx} ${sy} C ${cx1} ${sy}, ${cx2} ${ey}, ${ex} ${ey}`;
}

function NodeCard({
  node,
  selected,
  highlighted,
  readOnly,
  hasError,
  disconnected,
  onSelect,
  onMoveStart,
  staggerIndex,
}: {
  node: PlanNode;
  selected: boolean;
  highlighted: boolean;
  readOnly: boolean;
  hasError: boolean;
  disconnected?: boolean;
  onSelect: () => void;
  onMoveStart?: (e: React.PointerEvent) => void;
  staggerIndex?: number;
}) {
  const visual = getNodeVisual(node);
  const Icon = visual.lucide ? LUCIDE_MAP[visual.lucide] ?? Zap : null;
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  const subtitle =
    node.kind === "action"
      ? `${node.connectorId ?? "?"} → ${node.actionSlug ?? "?"}`
      : node.kind === "llm"
        ? visual.label
        : node.kind === "tool"
          ? node.toolId ?? "outil"
          : node.kind;

  const ariaLabel = `Étape ${node.name}, ${subtitle}${
    node.requiresApproval ? ", approbation requise" : ""
  }${node.riskLevel === "high" ? ", risque élevé" : ""}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerDown={readOnly ? undefined : onMoveStart}
      className={`absolute w-44 cursor-pointer overflow-hidden rounded-2xl border bg-card p-2.5 pl-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
        selected ? "border-accent ring-2 ring-accent/40" : "border-line hover:border-accent/40"
      } ${highlighted ? "animate-pulse" : ""} ${hasError ? "ring-2 ring-destructive/60" : ""}`}
      style={{
        left: x,
        top: y,
        animationDelay: staggerIndex !== undefined ? `${staggerIndex * 80}ms` : undefined,
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: visual.color }}
        aria-hidden
      />
      <div className="flex items-start gap-2">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-white"
          style={{ backgroundColor: visual.color }}
        >
          {Icon ? (
            <Icon className="h-4 w-4" />
          ) : visual.emoji ? (
            <span className="text-base leading-none">{visual.emoji}</span>
          ) : (
            <Zap className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">{node.name}</p>
          <p className="truncate text-[10px] text-ink-soft">{subtitle}</p>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {disconnected && (
          <span className="rounded bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-700">
            ⚠️ non connecté
          </span>
        )}
        {node.sharedEnv && (
          <span className="rounded bg-violet-50 px-1 py-0.5 text-[9px] font-medium text-violet-700">
            🌐 partagé
          </span>
        )}
        {node.kind === "action" && !node.sharedEnv && node.connectorId && (
          <span className="rounded bg-blue-50 px-1 py-0.5 text-[9px] font-medium text-blue-700">
            👤 client
          </span>
        )}
        {node.requiresApproval && (
          <span className="rounded bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-700">
            approbation
          </span>
        )}
        {node.riskLevel === "high" && (
          <span className="rounded bg-red-50 px-1 py-0.5 text-[9px] font-medium text-red-600">
            risque élevé
          </span>
        )}
      </div>
    </div>
  );
}

export function AgentCanvas({
  graph,
  selectedId,
  onSelect,
  onMoveNode,
  highlightedIds = [],
  readOnly = false,
  loading = false,
  validationIssues = [],
  disconnectedConnectors = [],
}: Props) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [scale, setScale] = useState(0.85);
  const dragRef = useRef<{ type: "pan" | "node"; id?: string; ox: number; oy: number; nx?: number; ny?: number } | null>(null);

  const errorNodeIds = useMemo(
    () => new Set(validationIssues.filter((i) => i.level === "error" && i.nodeId).map((i) => i.nodeId!)),
    [validationIssues],
  );

  const bbox = useMemo(() => {
    if (!graph?.nodes.length) return { w: 400, h: 200 };
    let maxX = 0;
    let maxY = 0;
    for (const n of graph.nodes) {
      maxX = Math.max(maxX, (n.x ?? 0) + NODE_W + 40);
      maxY = Math.max(maxY, (n.y ?? 0) + NODE_H + 40);
    }
    return { w: maxX, h: maxY };
  }, [graph]);

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || !graph?.nodes.length) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const s = Math.min(1.2, Math.max(0.4, Math.min(cw / bbox.w, ch / bbox.h) * 0.9));
    setScale(s);
    setPan({ x: Math.max(20, (cw - bbox.w * s) / 2), y: Math.max(20, (ch - bbox.h * s) / 2) });
  }, [bbox, graph]);

  useEffect(() => {
    if (graph?.nodes.length) fitToView();
  }, [graph?.entryId, graph?.nodes.length, fitToView]);

  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (!containerRef.current?.contains(e.target as globalThis.Node)) return;
      e.preventDefault();
      setScale((s) => Math.min(1.6, Math.max(0.4, s - e.deltaY * 0.001)));
    }
    const el = containerRef.current;
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => el?.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      if (d.type === "pan") {
        setPan({ x: d.ox + e.clientX - d.nx!, y: d.oy + e.clientY - d.ny! });
      } else if (d.type === "node" && d.id && onMoveNode) {
        const dx = (e.clientX - d.nx!) / scale;
        const dy = (e.clientY - d.ny!) / scale;
        onMoveNode(d.id, d.ox + dx, d.oy + dy);
      }
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onMoveNode, scale]);

  if (isMobile && graph) {
    const steps = graphToSteps(graph);
    return (
      <AgentFlowPreview
        steps={steps}
        confirmed
      />
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-card2 p-8 text-center">
        {loading ? (
          <div className="space-y-3">
            <div className="mx-auto h-24 w-48 animate-pulse rounded-lg bg-line/60" />
            <p className="text-sm text-ink-soft">Génération du plan en cours…</p>
          </div>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Workflow className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold text-ink">
              Le flux de ton agent apparaîtra ici
            </p>
            <p className="mt-1 max-w-xs text-xs text-ink-soft">
              Décris ton objectif pour générer les étapes, puis ajuste, connecte
              et réorganise chaque nœud directement sur le canvas.
            </p>
          </>
        )}
      </div>
    );
  }

  const edgesBySource = new Map<string, typeof graph.edges>();
  for (const e of graph.edges) {
    const list = edgesBySource.get(e.source) ?? [];
    list.push(e);
    edgesBySource.set(e.source, list);
  }

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          {graph.nodes.length} nœud(s) · {graph.edges.length} lien(s)
          {!readOnly && " · Glisser le fond pour déplacer, molette pour zoomer"}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2)))}
            aria-label="Dézoomer"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-card2"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))}
            aria-label="Zoomer"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-card2"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={fitToView}
            className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink-soft hover:bg-card2"
          >
            <Maximize2 className="h-3 w-3" />
            Ajuster
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative h-[440px] overflow-hidden rounded-2xl border border-line bg-[radial-gradient(circle_at_1px_1px,#e5e7eb_1px,transparent_0)] bg-[length:20px_20px] bg-card2"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvasBg) {
            onSelect(null);
            dragRef.current = { type: "pan", ox: pan.x, oy: pan.y, nx: e.clientX, ny: e.clientY };
          }
        }}
      >
        <div
          data-canvas-bg="1"
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          <svg
            width={bbox.w}
            height={bbox.h}
            className="pointer-events-none absolute left-0 top-0"
            style={{ overflow: "visible" }}
          >
            {graph.edges.map((edge) => {
              const src = graph.nodes.find((n) => n.id === edge.source);
              const tgt = graph.nodes.find((n) => n.id === edge.target);
              if (!src || !tgt) return null;
              const outs = edgesBySource.get(edge.source) ?? [];
              const fanIdx = outs.findIndex((o) => o.id === edge.id);
              const fanCount = outs.length;
              const fanOffset =
                fanCount > 1 ? (fanIdx - (fanCount - 1) / 2) * 18 : 0;
              const path = bezierPath(src.x ?? 0, src.y ?? 0, tgt.x ?? 0, tgt.y ?? 0, fanOffset);
              const mx =
                (src.x ?? 0) +
                NODE_W +
                ((tgt.x ?? 0) - (src.x ?? 0) - NODE_W) / 2;
              const my =
                (src.y ?? 0) +
                NODE_H / 2 +
                ((tgt.y ?? 0) - (src.y ?? 0)) / 2 +
                fanOffset;
              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    className="canvas-edge-flow text-ink-faint"
                    markerEnd="url(#arrowhead)"
                  />
                  {edge.label && (
                    <>
                      <rect
                        x={mx - 36}
                        y={my - 9}
                        width={72}
                        height={18}
                        rx={4}
                        className="fill-card stroke-line"
                        strokeWidth={1}
                      />
                      <text
                        x={mx}
                        y={my + 4}
                        textAnchor="middle"
                        className="fill-ink-soft text-[9px]"
                      >
                        {edge.label.slice(0, 14)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" className="fill-ink-faint" />
              </marker>
            </defs>
          </svg>

          {graph.nodes.map((node, i) => (
            <NodeCard
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              highlighted={highlightedIds.includes(node.id)}
              readOnly={readOnly || !onMoveNode}
              hasError={errorNodeIds.has(node.id)}
              disconnected={
                node.kind === "action" &&
                !!node.connectorId &&
                disconnectedConnectors.includes(node.connectorId)
              }
              staggerIndex={loading ? i : undefined}
              onSelect={() => onSelect(node.id)}
              onMoveStart={
                onMoveNode
                  ? (e) => {
                      e.stopPropagation();
                      dragRef.current = {
                        type: "node",
                        id: node.id,
                        ox: node.x ?? 0,
                        oy: node.y ?? 0,
                        nx: e.clientX,
                        ny: e.clientY,
                      };
                    }
                  : undefined
              }
            />
          ))}
        </div>

        {graph.nodes.length > 6 && (
          <div className="absolute bottom-2 right-2 h-16 w-24 rounded border border-line bg-card/90 p-1 opacity-80">
            <svg viewBox={`0 0 ${bbox.w} ${bbox.h}`} className="h-full w-full">
              {graph.nodes.map((n) => (
                <rect
                  key={n.id}
                  x={(n.x ?? 0) / bbox.w * 96}
                  y={(n.y ?? 0) / bbox.h * 56}
                  width={8}
                  height={5}
                  rx={1}
                  className={selectedId === n.id ? "fill-accent" : "fill-ink-faint"}
                />
              ))}
            </svg>
          </div>
        )}
      </div>
      <style jsx global>{`
        .canvas-edge-flow {
          animation: canvas-dash 1.2s linear infinite;
        }
        @keyframes canvas-dash {
          to {
            stroke-dashoffset: -20;
          }
        }
      `}</style>
    </div>
  );
}
