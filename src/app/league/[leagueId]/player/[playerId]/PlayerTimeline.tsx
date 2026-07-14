"use client";

import { useEffect, useRef } from "react";
import type { TimelinePoint } from "@/lib/playerProfile";

// A shaded line of the player's weekly points. Background columns are green
// (started) or red (benched); the line is colored by whoever owned him that
// week, with dashed dividers at ownership changes.
export function PlayerTimeline({
  timeline,
  colorByOwner,
}: {
  timeline: TimelinePoint[];
  colorByOwner: Record<string, string>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || timeline.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 680,
      H = 180,
      padL = 26,
      padR = 10,
      padT = 14,
      padB = 8;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const n = timeline.length;
    const maxPts = Math.max(20, ...timeline.map((t) => t.pts));
    const niceMax = Math.ceil(maxPts / 10) * 10;

    const X = (i: number) =>
      n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
    const Y = (p: number) => padT + plotH - (p / niceMax) * plotH;

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

    // Gridlines
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

    // Owner-colored line (segment color = left point's owner).
    ctx.lineWidth = 2;
    for (let i = 1; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(X(i - 1), Y(timeline[i - 1].pts));
      ctx.lineTo(X(i), Y(timeline[i].pts));
      ctx.strokeStyle = colorByOwner[timeline[i - 1].ownerId] ?? "#a1a1aa";
      ctx.stroke();
      // Dashed divider at an ownership change.
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

    // Dots
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(X(i), Y(timeline[i].pts), 2.4, 0, Math.PI * 2);
      ctx.fillStyle = "#e4e4e7";
      ctx.fill();
    }
  }, [timeline, colorByOwner]);

  return (
    <canvas
      ref={ref}
      width={680}
      height={180}
      style={{ width: "100%", height: "auto", display: "block" }}
    />
  );
}
