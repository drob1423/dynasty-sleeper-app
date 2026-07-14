"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelinePoint } from "@/lib/playerProfile";

const W = 680,
  H = 200,
  padL = 26,
  padR = 10,
  padT = 14,
  padB = 28;

// A shaded line of the player's weekly points. Background columns are green
// (started) or red (benched); the line is colored by whoever owned him that
// week. Week numbers label the axis; hovering a point shows the details.
export function PlayerTimeline({
  timeline,
  colorByOwner,
}: {
  timeline: TimelinePoint[];
  colorByOwner: Record<string, string>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = timeline.length;

  const niceMax = useMemo(() => {
    const m = Math.max(20, ...timeline.map((t) => t.pts));
    return Math.ceil(m / 10) * 10;
  }, [timeline]);

  const X = (i: number) =>
    n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
  const Y = (p: number) => padT + plotH - (p / niceMax) * plotH;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || n === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    // Background bands: green = started, red = benched.
    const step = n > 1 ? plotW / (n - 1) : plotW;
    timeline.forEach((t, i) => {
      let bx = X(i) - step / 2;
      let bw = step;
      if (bx < padL) {
        bw -= padL - bx;
        bx = padL;
      }
      if (bx + bw > padL + plotW) bw = padL + plotW - bx;
      ctx.fillStyle = t.started
        ? "rgba(52,211,153,0.13)"
        : "rgba(248,113,113,0.16)";
      ctx.fillRect(bx, padT, bw, plotH);
    });

    // Gridlines + y labels
    ctx.strokeStyle = "rgba(113,113,122,0.22)";
    ctx.fillStyle = "#52525b";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    for (let g = 10; g < niceMax; g += 10) {
      const y = Y(g);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(String(g), padL - 4, y + 3);
    }

    // Week labels on the x-axis
    ctx.textAlign = "center";
    ctx.fillStyle = "#52525b";
    ctx.font = "9px sans-serif";
    timeline.forEach((t, i) => {
      ctx.fillText(String(t.week), X(i), padT + plotH + 13);
    });

    // Owner-colored line + ownership-change dividers
    ctx.lineWidth = 2;
    for (let i = 1; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(X(i - 1), Y(timeline[i - 1].pts));
      ctx.lineTo(X(i), Y(timeline[i].pts));
      ctx.strokeStyle = colorByOwner[timeline[i - 1].ownerId] ?? "#a1a1aa";
      ctx.stroke();
      if (timeline[i].ownerId !== timeline[i - 1].ownerId) {
        const dx = (X(i - 1) + X(i)) / 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.moveTo(dx, padT);
        ctx.lineTo(dx, padT + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
      }
    }

    // Dots (hovered one enlarged)
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(X(i), Y(timeline[i].pts), i === hover ? 4 : 2.4, 0, Math.PI * 2);
      ctx.fillStyle = i === hover ? "#fff" : "#e4e4e7";
      ctx.fill();
    }
  }, [timeline, colorByOwner, niceMax, hover, n, plotH, plotW]);

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    if (!canvas || n === 0) return;
    const rect = canvas.getBoundingClientRect();
    const ix = ((e.clientX - rect.left) * W) / rect.width;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(X(i) - ix);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  }

  const hp = hover != null ? timeline[hover] : null;

  return (
    <div className="relative">
      <canvas
        ref={ref}
        width={W}
        height={H}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
      {hp && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${(X(hover!) / W) * 100}%`,
            top: `${(Y(hp.pts) / H) * 100}%`,
          }}
        >
          <div className="font-medium text-white">
            {hp.seasonLabel} · Wk {hp.week}
          </div>
          <div className="text-zinc-300">{hp.pts.toFixed(1)} pts</div>
          <div className={hp.started ? "text-emerald-400" : "text-red-400"}>
            {hp.started ? "Started" : "Benched"}
          </div>
        </div>
      )}
    </div>
  );
}
