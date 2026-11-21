// Gráficos em SVG (sem biblioteca): linha com área e barras. Passe o mouse ou toque para ver o valor.
import { useState } from "react";
import { fmtInt, fmtKg } from "../lib/dominio";

export interface Ponto {
  label: string;
  y: number;
  tip: string;
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) { min = min - 1; max = max + 1; }
  const span = max - min, step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0))), r = step0 / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) t.push(+v.toFixed(6));
  return t;
}

function useDica() {
  const [dica, setDica] = useState<{ x: number; y: number; t: string } | null>(null);
  const mostrar = (t: string) => (e: React.PointerEvent | React.MouseEvent) => setDica({ x: e.clientX, y: e.clientY, t });
  const el = dica ? (
    <div className="tip" style={{ left: Math.min(dica.x + 12, window.innerWidth - 220), top: Math.max(dica.y - 60, 8) }}>{dica.t}</div>
  ) : null;
  return { mostrar, esconder: () => setDica(null), el };
}

export function GraficoLinha({ pts, unidade, fmt = fmtKg }: { pts: Ponto[]; unidade: string; fmt?: (n: number) => string }) {
  const { mostrar, esconder, el } = useDica();
  const W = 600, H = 220, L = 44, R = 16, T = 12, B = 26, iw = W - L - R, ih = H - T - B;
  const ys = pts.map((p) => p.y);
  const t = niceTicks(Math.min(...ys), Math.max(...ys), 4), lo = t[0], hi = t[t.length - 1];
  const x = (i: number) => L + (pts.length === 1 ? iw / 2 : (i * iw) / (pts.length - 1));
  const y = (v: number) => T + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const linha = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  const area = linha + `L${x(pts.length - 1).toFixed(1)},${T + ih}L${x(0).toFixed(1)},${T + ih}Z`;
  const passo = Math.max(1, Math.ceil(pts.length / 6)), hitW = pts.length > 1 ? iw / (pts.length - 1) : iw, lp = pts[pts.length - 1];
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico de linha" onPointerLeave={esconder}>
        {t.map((v) => (
          <g key={v}><line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{fmt(v)}</text></g>
        ))}
        {pts.map((p, i) => (i % passo === 0 || i === pts.length - 1 ? <text key={"l" + i} x={x(i)} y={H - 6} textAnchor="middle">{p.label}</text> : null))}
        <path d={area} fill="var(--chart)" opacity={0.12} />
        <path d={linha} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.length <= 40 && pts.map((p, i) => <circle key={"c" + i} cx={x(i)} cy={y(p.y)} r={3.5} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />)}
        <circle cx={x(pts.length - 1)} cy={y(lp.y)} r={5.5} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
        <text x={x(pts.length - 1) - 8} y={y(lp.y) - 10} textAnchor="end" style={{ fill: "var(--ink)", fontWeight: 700 }}>{fmt(lp.y)} {unidade}</text>
        {pts.map((p, i) => (
          <rect key={"h" + i} className="hit" x={x(i) - hitW / 2} y={T} width={hitW} height={ih} onPointerMove={mostrar(p.tip)} onClick={mostrar(p.tip)} />
        ))}
      </svg>
      {el}
    </>
  );
}

export function GraficoBarras({ pts, W = 600, fmt = fmtInt }: { pts: Ponto[]; W?: number; fmt?: (n: number) => string }) {
  const { mostrar, esconder, el } = useDica();
  const H = 220, L = 50, R = 12, T = 12, B = 26, iw = W - L - R, ih = H - T - B;
  const max = Math.max(...pts.map((p) => p.y), 1), t = niceTicks(0, max, 4), hi = t[t.length - 1];
  const bw = iw / pts.length, gap = Math.min(2 + bw * 0.25, 14), w = Math.max(bw - gap, 2);
  const y = (v: number) => T + ih - (v / hi) * ih, passo = Math.max(1, Math.ceil(pts.length / 8)), r = Math.min(4, w / 2);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico de barras" onPointerLeave={esconder}>
        {t.map((v) => (
          <g key={v}><line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{fmt(v)}</text></g>
        ))}
        {pts.map((p, i) => {
          const x0 = L + i * bw + gap / 2, h = Math.max(T + ih - y(p.y), 0), top = T + ih - h, rr = Math.min(r, h);
          const d = h > 0 ? `M${x0},${T + ih}V${top + rr}Q${x0},${top} ${x0 + rr},${top}H${x0 + w - rr}Q${x0 + w},${top} ${x0 + w},${top + rr}V${T + ih}Z` : "";
          return (
            <g key={i}>
              {d && <path d={d} fill="var(--chart)" />}
              {(i % passo === 0 || i === pts.length - 1) && <text x={x0 + w / 2} y={H - 6} textAnchor="middle">{p.label}</text>}
              <rect className="hit" x={L + i * bw} y={T} width={bw} height={ih} onPointerMove={mostrar(p.tip)} onClick={mostrar(p.tip)} />
            </g>
          );
        })}
      </svg>
      {el}
    </>
  );
}
