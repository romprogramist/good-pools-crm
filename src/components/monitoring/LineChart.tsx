"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = { t: number; v: number };

const TZ = "Europe/Moscow";
const H = 168;
const M = { top: 12, right: 14, bottom: 24, left: 46 };

function fmtNum(v: number, digits: number) {
  return v.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function LineChart({
  points,
  from,
  to,
  label,
  unit,
  digits,
  normMin,
  normMax,
}: {
  points: Point[];
  from: number;
  to: number;
  label: string;
  unit: string | null;
  digits: number;
  normMin: number | null;
  normMax: number | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const innerW = Math.max(40, width - M.left - M.right);
    const innerH = H - M.top - M.bottom;
    const values = points.map((p) => p.v);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const hasBand = normMin !== null && normMax !== null;
    if (hasBand) {
      lo = Math.min(lo, normMin);
      hi = Math.max(hi, normMax);
    }
    const span = hi - lo;
    const pad = span > 0 ? span * 0.1 : Math.max(Math.abs(hi) * 0.05, 0.5);
    lo -= pad;
    hi += pad;

    const x = (t: number) => M.left + ((t - from) / Math.max(1, to - from)) * innerW;
    const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * innerH;

    // Разрыв линии, если между точками пропуск заметно больше обычного шага.
    const gaps = points.slice(1).map((p, i) => p.t - points[i].t).sort((a, b) => a - b);
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    const breakAfter = Math.max(median * 2.5, 2 * 3_600_000);

    let d = "";
    points.forEach((p, i) => {
      const move = i === 0 || p.t - points[i - 1].t > breakAfter;
      d += `${move ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)} `;
    });

    const yTicks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
    const xTicks = [0, 1 / 3, 2 / 3, 1].map((k) => from + (to - from) * k);
    return { innerW, innerH, x, y, d, yTicks, xTicks, lo, hi, hasBand };
  }, [points, from, to, width, normMin, normMax]);

  const longRange = to - from > 36 * 3_600_000;
  const xFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(
        "ru-RU",
        longRange
          ? { timeZone: TZ, day: "numeric", month: "short" }
          : { timeZone: TZ, hour: "2-digit", minute: "2-digit" },
      ),
    [longRange],
  );
  const tipFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        timeZone: TZ,
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [],
  );

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(geo.x(p.t) - px);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setHover(best);
  }

  const last = points[points.length - 1];
  const hp = hover !== null ? points[hover] : null;
  const tipLeft = hp ? Math.min(Math.max(geo.x(hp.t), 70), width - 70) : 0;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`${label}: график за период, последнее значение ${fmtNum(last.v, digits)}${unit ? " " + unit : ""}`}
        className="block touch-pan-y"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {geo.hasBand && normMin !== null && normMax !== null && (
          <>
            <rect
              x={M.left}
              y={geo.y(normMax)}
              width={geo.innerW}
              height={Math.max(0, geo.y(normMin) - geo.y(normMax))}
              className="fill-emerald-500/10"
            />
            <text
              x={M.left + geo.innerW - 4}
              y={geo.y(normMax) + 12}
              textAnchor="end"
              className="fill-emerald-700 text-[10px] font-medium"
            >
              ориентир нормы
            </text>
          </>
        )}

        {geo.yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={M.left}
              x2={M.left + geo.innerW}
              y1={geo.y(v)}
              y2={geo.y(v)}
              className="stroke-zinc-200"
              strokeDasharray={i === 0 ? undefined : "2 4"}
            />
            <text x={M.left - 8} y={geo.y(v) + 4} textAnchor="end" className="fill-zinc-500 text-[11px] tabular-nums">
              {fmtNum(v, digits)}
            </text>
          </g>
        ))}

        {geo.xTicks.map((t, i) => (
          <text
            key={i}
            x={geo.x(t)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === geo.xTicks.length - 1 ? "end" : "middle"}
            className="fill-zinc-500 text-[11px] tabular-nums"
          >
            {xFmt.format(new Date(t))}
          </text>
        ))}

        <path d={geo.d} fill="none" className="stroke-teal-600" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {hp ? (
          <>
            <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={M.top} y2={M.top + geo.innerH} className="stroke-zinc-400" />
            <circle cx={geo.x(hp.t)} cy={geo.y(hp.v)} r={5} className="fill-teal-600 stroke-white" strokeWidth={2} />
          </>
        ) : (
          <circle cx={geo.x(last.t)} cy={geo.y(last.v)} r={4.5} className="fill-teal-600 stroke-white" strokeWidth={2} />
        )}
      </svg>

      {hp && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: tipLeft }}
        >
          <span className="font-semibold tabular-nums">
            {fmtNum(hp.v, digits)}
            {unit ? ` ${unit}` : ""}
          </span>
          <span className="ml-2 text-zinc-300">{tipFmt.format(new Date(hp.t))}</span>
        </div>
      )}
    </div>
  );
}
