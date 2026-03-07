import React, { useState, useRef } from "react";

const GENS = 4;
const GEN_COLORS = ["#00D4FF", "#00FF94", "#FFB800", "#FF4D6D"];
const REV_COLOR = "#C084FC";

function SliderRow({ label, value, set, min, max, step, disp, color = "#00D4FF", isInput = false }) {
  return (
    <div style={{ background: isInput ? "#0F1F35" : "#0D1825", borderRadius: 8, padding: "12px 14px", border: isInput ? `1px solid ${color}30` : "1px solid #1A2535" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 11, color: isInput ? color : "#718096", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: isInput ? 600 : 400 }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color }}>{disp(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={e => set(+e.target.value)}
        onChange={e => set(+e.target.value)}
        style={{ width: "100%", accentColor: color, cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 10, color: "#2D3748" }}>{disp(min)}</span>
        <span style={{ fontSize: 10, color: "#2D3748" }}>{disp(max)}</span>
      </div>
    </div>
  );
}

export default function App() {
  // Core sliders
  const [margin, setMargin] = useState(45);
  const [lifespan, setLifespan] = useState(18);
  const [growth, setGrowth] = useState(80);
  const [costMult, setCostMult] = useState(3);
  // Initial conditions
  const [initRevMM, setInitRevMM] = useState(250);   // monthly revenue $mm
  const [initTrainMM, setInitTrainMM] = useState(500); // Gen-1 training cost $mm
  const [hwOffset, setHwOffset] = useState(3);         // hardware efficiency offset (raw 10x → dollar xMult)

  const [hoveredGen, setHoveredGen] = useState(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const svgRef = useRef(null);

  const m = margin / 100;
  const g = growth / 100;
  const gM = Math.pow(1 + g, 1 / 12) - 1; // monthly growth

  // Effective dollar cost growth combines scaling pressure and hardware efficiency.
  // Higher hwOffset means better efficiency, so it reduces effective cost growth.
  const effectiveCostMult = costMult * (3 / hwOffset);
  // Training costs: Gen-1 = initTrainMM, each subsequent gen × effectiveCostMult
  const trainingCosts = Array.from({ length: GENS }, (_, i) =>
    Math.round(initTrainMM * Math.pow(effectiveCostMult, i))
  );

  // Starting monthly revenue per gen
  const startRevs = [];
  let rv = initRevMM;
  for (let i = 0; i < GENS; i++) {
    startRevs.push(rv);
    rv = rv * Math.pow(1 + g, lifespan / 12);
  }

  // Cumulative P&L curve per gen
  const buildCurve = (gi) => {
    const tc = trainingCosts[gi];
    const r0 = startRevs[gi];
    const pts = [-tc];
    let cum = -tc;
    for (let mo = 1; mo <= lifespan; mo++) {
      cum += r0 * Math.pow(1 + gM, mo - 1) * m;
      pts.push(cum);
    }
    return pts;
  };

  // ARR run-rate across all gens
  const buildRevCurve = () => {
    const pts = [];
    for (let gi = 0; gi < GENS; gi++) {
      const r0 = startRevs[gi];
      for (let mo = 0; mo <= lifespan; mo++) {
        pts.push({ mo: gi * lifespan + mo, arr: r0 * Math.pow(1 + gM, mo) * 12 });
      }
    }
    return pts;
  };

  const curves = Array.from({ length: GENS }, (_, i) => buildCurve(i));
  const revCurve = buildRevCurve();

  const allPnL = curves.flat();
  const pnlMin = Math.min(...allPnL);
  const pnlMax = Math.max(...allPnL);
  const pnlPad = Math.abs(pnlMax - pnlMin) * 0.1;
  const yMin = pnlMin - pnlPad;
  const yMax = pnlMax + pnlPad;

  const allARR = revCurve.map(p => p.arr);
  const arrMax = Math.max(...allARR) * 1.15;

  const W = 1000, H = 490;
  const PAD = { top: 48, right: 40, bottom: 60, left: 120 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const totalMonths = GENS * lifespan;

  const xS = mo => (mo / totalMonths) * chartW;
  const yS = v => chartH - ((v - yMin) / (yMax - yMin)) * chartH;
  const yR = v => chartH - (v / arrMax) * chartH;
  const yZero = yS(0);

  const buildPath = i => {
    const pts = curves[i], offset = i * lifespan;
    return pts.map((v, mo) => `${mo === 0 ? "M" : "L"} ${xS(offset + mo).toFixed(1)} ${yS(v).toFixed(1)}`).join(" ");
  };

  const buildArea = i => {
    const pts = curves[i], offset = i * lifespan;
    const mp = pts.map((v, mo) => ({ x: xS(offset + mo), y: yS(v) }));
    return mp.map((p, j) => `${j === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      + ` L ${mp[mp.length - 1].x.toFixed(1)} ${yZero.toFixed(1)} L ${mp[0].x.toFixed(1)} ${yZero.toFixed(1)} Z`;
  };

  const buildRevPath = () =>
    revCurve.map((p, i) => `${i === 0 ? "M" : "L"} ${xS(p.mo).toFixed(1)} ${yR(p.arr).toFixed(1)}`).join(" ");

  const reqARR = gi => gi >= GENS - 1 ? null : (trainingCosts[gi + 1] / (lifespan * m)) * 12;

  const fmtV = v => {
    const abs = Math.abs(v), s = v < 0 ? "-" : "+";
    return abs >= 1000 ? `${s}$${(abs / 1000).toFixed(1)}bn` : `${s}$${Math.round(abs)}mm`;
  };
  const fmtA = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}bn` : `$${Math.round(v)}mm`;
  const fmtM = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}bn` : `$${Math.round(v)}mm`;

  // Tick helpers
  const makeTicks = (min, max, count = 6) => {
    const raw = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
    const step = Math.ceil(raw / mag) * mag;
    const first = Math.ceil(min / step) * step;
    const ticks = [];
    for (let t = first; t <= max + step * 0.1; t += step) ticks.push(Math.round(t));
    return ticks;
  };
  const yTicks = makeTicks(yMin, yMax);
  const arrTicks = makeTicks(0, arrMax);

  // Summaries
  const summaries = curves.map((pts, i) => {
    const finalVal = pts[pts.length - 1];
    const nextCost = i < GENS - 1 ? trainingCosts[i + 1] : null;
    const selfFunded = nextCost !== null ? finalVal >= nextCost : finalVal > 0;
    const ratio = (nextCost || trainingCosts[i]) / (startRevs[i] * lifespan * m);
    const reqG = ratio <= 1 ? 0 : (Math.pow(ratio, 12 / lifespan) - 1) * 100;
    const endARR = startRevs[i] * Math.pow(1 + gM, lifespan) * 12;
    const rARR = reqARR(i);
    const capitalGap = nextCost ? Math.max(0, nextCost - finalVal) : 0;
    return { finalVal, nextCost, selfFunded, reqG, endARR, rARR, capitalGap };
  });

  const allSelfFunded = summaries.every(s => s.selfFunded);
  const firstBreak = summaries.findIndex(s => !s.selfFunded);
  const totalCapNeeded = summaries.reduce((acc, s) => acc + s.capitalGap, 0);

  const FS = 11;

  return (
    <div style={{ background: "#050B14", minHeight: "100vh", fontFamily: "'DM Mono','Courier New',monospace", color: "#E8EAF0", padding: "20px" }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, background: "linear-gradient(90deg,#00D4FF,#00FF94)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          LLM Generation J-Curves
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: "#4A5568" }}>
          Self-funding economics of frontier model companies — can GP from Gen N cover the mandatory training cost of Gen N+1?
        </p>
      </div>

      {/* ── SUMMARY BANNER ── */}
      <div style={{ background: "#0D1825", border: `1px solid ${allSelfFunded ? "#00FF9440" : "#FF4D6D40"}`, borderLeft: `4px solid ${allSelfFunded ? "#00FF94" : "#FF4D6D"}`, borderRadius: 10, padding: "14px 18px", marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: "#718096", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Self-Funding Status</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: allSelfFunded ? "#00FF94" : "#FF4D6D" }}>
            {allSelfFunded ? "✓ All gens self-fund" : firstBreak >= 0 ? `✗ Breaks at Gen ${firstBreak + 1}` : "✗ Never self-funds"}
          </div>
          <div style={{ fontSize: 11, color: "#4A5568", marginTop: 2 }}>at {growth}% growth / {margin}% margin</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#718096", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Total Capital Needed</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: totalCapNeeded > 0 ? "#FFB800" : "#00FF94" }}>
            {totalCapNeeded > 0 ? fmtM(totalCapNeeded) : "$0"}
          </div>
          <div style={{ fontSize: 11, color: "#4A5568", marginTop: 2 }}>external capital across all gens</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#718096", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Gen 4 Training Cost</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#E8EAF0" }}>{fmtM(trainingCosts[GENS - 1])}</div>
          <div style={{ fontSize: 11, color: "#4A5568", marginTop: 2 }}>the mandatory tax by Gen {GENS}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#718096", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Required ARR by Gen 4</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: REV_COLOR }}>
            {fmtA(summaries[GENS - 2]?.rARR || 0)}/yr
          </div>
          <div style={{ fontSize: 11, color: "#4A5568", marginTop: 2 }}>to self-fund Gen {GENS} training</div>
        </div>
      </div>

      {/* ── INITIAL CONDITIONS ── */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: "#C084FC", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>
          ⚙ Initial Conditions
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
          <SliderRow label="Gen-1 Monthly Revenue ($mm)" value={initRevMM} set={setInitRevMM} min={10} max={1000} step={10}
            disp={v => `$${v}mm/mo`} color={REV_COLOR} isInput />
          <SliderRow label="Gen-1 Training Cost ($mm)" value={initTrainMM} set={setInitTrainMM} min={10} max={2000} step={10}
            disp={v => `$${v}mm`} color="#F97316" isInput />
          <SliderRow label="Hardware Efficiency Offset" value={hwOffset} set={setHwOffset} min={1} max={10} step={0.5}
            disp={v => `${v}x`} color="#94A3B8" isInput />
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginBottom: 14, paddingLeft: 2 }}>
          Effective training multiplier = Scaling Law Multiplier x (3 / Hardware Efficiency Offset). Higher hardware efficiency lowers dollar cost growth across generations.
        </div>
      </div>

      {/* ── ASSUMPTION SLIDERS ── */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: "#00D4FF", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontWeight: 600 }}>
          ⚙ Model Assumptions
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
          <SliderRow label="Inference Margin" value={margin} set={setMargin} min={0} max={100} step={1} disp={v => `${v}%`} />
          <SliderRow label="Model Dominance (months)" value={lifespan} set={setLifespan} min={3} max={48} step={3} disp={v => `${v} mo`} />
          <SliderRow label="Revenue Growth" value={growth} set={setGrowth} min={0} max={1000} step={10} disp={v => `${v}%`} />
          <SliderRow label="Scaling Law Multiplier" value={costMult} set={setCostMult} min={1} max={10} step={0.5} disp={v => `${v}x`} />
        </div>
      </div>

      {/* ── AXIS LEGEND ── */}
      <div style={{ display: "flex", gap: 20, marginBottom: 8, paddingLeft: 2, alignItems: "center", flexWrap: "wrap" }}>
        {GEN_COLORS.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 20, height: 2, background: c }} />
            <span style={{ fontSize: 11, color: c }}>Gen {i + 1} P&L</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 20, height: 2, background: REV_COLOR }} />
          <span style={{ fontSize: 11, color: REV_COLOR }}>ARR run-rate</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 14, height: 0, borderTop: "2px dashed #A0AEC0" }} />
          <span style={{ fontSize: 11, color: "#A0AEC0" }}>Required ARR for next gen</span>
        </div>
      </div>

      {/* ── CHART ── */}
      <div style={{ background: "#0A1628", borderRadius: 14, border: "1px solid #1A2535", padding: "18px 18px 6px", marginBottom: 14 }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
          onMouseMove={e => {
            const rect = svgRef.current.getBoundingClientRect();
            const mx = (e.clientX - rect.left) * (W / rect.width) - PAD.left;
            const gi = Math.floor(mx / (chartW / GENS));
            setHoveredGen(gi >= 0 && gi < GENS ? gi : null);
          }}
          onMouseLeave={() => setHoveredGen(null)}
        >
          <defs>
            {GEN_COLORS.map((color, i) => (
              <linearGradient key={i} id={`g${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0.03" />
              </linearGradient>
            ))}
            <clipPath id="clip"><rect x={0} y={0} width={chartW} height={chartH} /></clipPath>
          </defs>

          <g transform={`translate(${PAD.left},${PAD.top})`}>

            {/* P&L grid + left labels */}
            {yTicks.map(t => (
              <g key={`y${t}`}>
                <line x1={0} y1={yS(t)} x2={chartW} y2={yS(t)}
                  stroke={t === 0 ? "#2D4060" : "#0F1C2E"}
                  strokeWidth={t === 0 ? 1.5 : 1}
                  strokeDasharray={t === 0 ? "none" : "4 6"} />
                <text x={-10} y={yS(t) + 4} textAnchor="end" fill={t === 0 ? "#64748B" : "#263347"} fontSize={FS}>
                  {Math.abs(t) >= 1000 ? `${t < 0 ? "-" : ""}$${(Math.abs(t) / 1000).toFixed(0)}bn` : `${t < 0 ? "-" : ""}$${Math.abs(t)}mm`}
                </text>
              </g>
            ))}

            {/* ARR labels — purple, left axis */}
            {arrTicks.map(t => {
              const y = yR(t);
              if (y < -8 || y > chartH + 8) return null;
              return (
                <g key={`a${t}`}>
                  <line x1={-3} y1={y} x2={0} y2={y} stroke={REV_COLOR} strokeWidth={1} strokeOpacity={0.5} />
                  <text x={-10} y={y + 4} textAnchor="end" fill={REV_COLOR} fontSize={FS} fillOpacity={0.7}>{fmtA(t)}</text>
                </g>
              );
            })}

            {/* Axis rotated label */}
            <text x={-PAD.left + 12} y={chartH / 2} textAnchor="middle" fill="#374151" fontSize={FS}
              transform={`rotate(-90,${-PAD.left + 12},${chartH / 2})`}>
              P&L ($mm) · ARR (purple)
            </text>

            {/* Gen columns */}
            {Array.from({ length: GENS }, (_, i) => {
              const x0 = xS(i * lifespan), x1 = xS((i + 1) * lifespan), midX = (x0 + x1) / 2;
              return (
                <g key={i}>
                  {hoveredGen === i && <rect x={x0} y={0} width={x1 - x0} height={chartH} fill={GEN_COLORS[i]} fillOpacity={0.05} />}
                  <line x1={x0} y1={0} x2={x0} y2={chartH} stroke="#1A2D42" strokeWidth={1} />
                  <text x={midX} y={-24} textAnchor="middle" fill={hoveredGen === i ? GEN_COLORS[i] : GEN_COLORS[i] + "99"} fontSize={FS + 1} fontWeight={700} letterSpacing="0.06em">GEN {i + 1}</text>
                  <text x={midX} y={-11} textAnchor="middle" fill="#263347" fontSize={FS - 1}>tc {fmtM(trainingCosts[i])}</text>
                  <line x1={x0} y1={yZero} x2={x0} y2={yS(-trainingCosts[i])} stroke={GEN_COLORS[i]} strokeWidth={1} strokeDasharray="2 3" strokeOpacity={0.5} />
                  <circle cx={x0} cy={yS(-trainingCosts[i])} r={3} fill={GEN_COLORS[i]} opacity={0.7} />
                </g>
              );
            })}
            <line x1={chartW} y1={0} x2={chartW} y2={chartH} stroke="#1A2D42" strokeWidth={1} />

            {/* X labels */}
            {Array.from({ length: GENS * lifespan + 1 }, (_, mo) => {
              const interval = lifespan <= 6 ? 3 : lifespan <= 12 ? 6 : lifespan <= 24 ? 12 : 18;
              if (mo % interval !== 0) return null;
              return <text key={mo} x={xS(mo)} y={chartH + 18} textAnchor="middle" fill="#263347" fontSize={FS}>{mo}mo</text>;
            })}
            <text x={chartW / 2} y={chartH + 38} textAnchor="middle" fill="#374151" fontSize={FS + 1}>Months elapsed</text>

            {/* Area fills */}
            <g clipPath="url(#clip)">
              {Array.from({ length: GENS }, (_, i) => (
                <path key={i} d={buildArea(i)} fill={`url(#g${i})`} opacity={hoveredGen !== null && hoveredGen !== i ? 0.3 : 1} />
              ))}
            </g>

            {/* Required ARR threshold lines */}
            {Array.from({ length: GENS - 1 }, (_, i) => {
              const rARR = reqARR(i); if (!rARR) return null;
              const ty = yR(rARR);
              if (ty < -10 || ty > chartH + 10) return null;
              const x0 = xS(i * lifespan), x1 = xS((i + 1) * lifespan);
              return (
                <g key={i} opacity={hoveredGen === i || hoveredGen === null ? 0.85 : 0.2}>
                  <line x1={x0} y1={ty} x2={x1} y2={ty} stroke={GEN_COLORS[i + 1]} strokeWidth={1.2} strokeDasharray="5 4" />
                  <text x={x0 + 6} y={ty - 5} textAnchor="start" fill={GEN_COLORS[i + 1]} fontSize={FS - 1}>
                    req. ARR → {fmtA(rARR)}/yr
                  </text>
                </g>
              );
            })}

            {/* Revenue curve */}
            <g clipPath="url(#clip)">
              <path d={buildRevPath()} fill="none" stroke={REV_COLOR} strokeWidth={2.2} strokeOpacity={0.9} />
              <path d={buildRevPath() + ` L ${xS(totalMonths).toFixed(1)} ${chartH.toFixed(1)} L ${xS(0).toFixed(1)} ${chartH.toFixed(1)} Z`}
                fill={REV_COLOR} fillOpacity={0.04} />
            </g>

            {/* ARR boundary dots */}
            {Array.from({ length: GENS + 1 }, (_, i) => {
              const mo = i * lifespan;
              const pt = revCurve.find(p => p.mo === mo);
              if (!pt) return null;
              const cx = xS(mo), cy = yR(pt.arr);
              return (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={4} fill={REV_COLOR} stroke="#050B14" strokeWidth={1.5} opacity={0.95} />
                  <text x={cx + 7} y={cy - 7} fill={REV_COLOR} fontSize={FS} textAnchor="start" fillOpacity={0.9} fontWeight={600}>
                    {fmtA(pt.arr)}/yr
                  </text>
                </g>
              );
            })}

            {/* J-curves */}
            {Array.from({ length: GENS }, (_, i) => (
              <path key={i} d={buildPath(i)} fill="none" stroke={GEN_COLORS[i]}
                strokeWidth={hoveredGen === i ? 2.8 : 2}
                strokeOpacity={hoveredGen !== null && hoveredGen !== i ? 0.25 : 1}
                style={{ transition: "stroke-width 0.12s,stroke-opacity 0.12s" }} />
            ))}

            {/* End dots */}
            {curves.map((pts, i) => (
              <circle key={i} cx={xS((i + 1) * lifespan)} cy={yS(pts[pts.length - 1])} r={6}
                fill={summaries[i].selfFunded ? GEN_COLORS[i] : "#FF4D6D"} stroke="#050B14" strokeWidth={2} />
            ))}
          </g>
        </svg>
      </div>

      {/* ── GEN CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        {summaries.map((s, i) => (
          <div key={i} style={{ background: "#0D1825", border: `1px solid ${s.selfFunded ? GEN_COLORS[i] + "40" : "#FF4D6D40"}`, borderTop: `3px solid ${s.selfFunded ? GEN_COLORS[i] : "#FF4D6D"}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <span style={{ fontSize: 13, color: GEN_COLORS[i], fontWeight: 700 }}>GEN {i + 1}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: s.selfFunded ? GEN_COLORS[i] + "20" : "#FF4D6D20", color: s.selfFunded ? GEN_COLORS[i] : "#FF4D6D" }}>
                {s.selfFunded ? "✓ SELF-FUNDED" : "✗ NEEDS CAPITAL"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#718096", marginBottom: 2 }}>Train cost: <span style={{ color: "#E8EAF0", fontWeight: 600 }}>{fmtM(trainingCosts[i])}</span></div>
            <div style={{ fontSize: 12, color: "#718096", marginBottom: 2 }}>GP earned: <span style={{ color: s.finalVal > 0 ? "#00FF94" : "#FF4D6D", fontWeight: 600 }}>{fmtV(s.finalVal)}</span></div>
            <div style={{ fontSize: 12, color: "#718096", marginBottom: 2 }}>Exit ARR: <span style={{ color: REV_COLOR, fontWeight: 600 }}>{fmtA(s.endARR)}/yr</span></div>
            {s.rARR && <div style={{ fontSize: 12, color: "#718096", marginBottom: 2 }}>Req. ARR: <span style={{ color: s.endARR >= s.rARR ? "#00FF94" : "#FF4D6D", fontWeight: 600 }}>{fmtA(s.rARR)}/yr</span></div>}
            {!s.selfFunded && s.capitalGap > 0 && <div style={{ fontSize: 12, color: "#718096", marginBottom: 2 }}>Capital gap: <span style={{ color: "#FF4D6D", fontWeight: 600 }}>{fmtM(s.capitalGap)}</span></div>}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1A2535", fontSize: 11, color: "#718096" }}>
              Req growth: <span style={{ color: s.reqG <= growth ? "#00FF94" : "#FFB800", fontWeight: 700 }}>{s.reqG.toFixed(0)}%</span>
              <span style={{ color: "#2D3748" }}> vs {growth}% actual</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── GLOSSARY ── */}
      <div style={{ background: "#0D1825", border: "1px solid #1A2535", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
        <button onClick={() => setShowGlossary(!showGlossary)}
          style={{ width: "100%", background: "none", border: "none", color: "#E8EAF0", padding: "14px 18px", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
          <span>📖 Glossary & Algebra</span>
          <span style={{ color: "#4A5568" }}>{showGlossary ? "▲ collapse" : "▼ expand"}</span>
        </button>

        {showGlossary && (
          <div style={{ padding: "0 18px 18px", borderTop: "1px solid #1A2535" }}>

            {/* Terms */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px", marginTop: 16 }}>
              {[
                ["Gen-1 Monthly Revenue (R_1,0)", "Starting monthly revenue run-rate for Generation 1 (in $mm/month). This is the revenue base that compounds during Gen-1 dominance. Higher starting revenue raises gross profit accumulation and improves self-funding odds."],
                ["Gen-1 Training Cost (C_1)", "Upfront training spend for the first frontier model (in $mm). Every later generation cost is derived from this base via the effective cost multiplier. Higher C_1 deepens the initial J-curve drawdown."],
                ["Scaling Law Multiplier (k)", "The raw compute required to produce a meaningfully better model grows approximately 10x per generation. This is the 'Scaling Law.' In dollar terms, hardware improvements (Moore's Law) partially offset this, so the actual dollar cost per generation grows by a smaller multiplier k (typically 3–5x). Formally: Cost_n = Cost_1 × k^(n−1)."],
                ["Hardware Efficiency Offset", "The ratio by which chip performance improves per generation, reducing the dollar translation of the 10x raw compute increase. If chips get 3x more efficient per generation, a 10x compute increase costs only ~3x more in dollars."],
                ["Effective Cost Multiplier (k_eff)", "Per-generation dollar cost growth used by this simulator after combining scaling pressure and hardware efficiency. Here: k_eff = (k / h) × 3, where k is Scaling Law Multiplier and h is Hardware Efficiency Offset."],
                ["Model Dominance (months)", "The number of months a model remains the frontier model before being surpassed by a competitor or successor. This is the critical lifespan over which it must generate enough gross profit to fund the next training run. Shorter dominance = steeper treadmill."],
                ["Inference Margin (%)", "The fraction of revenue retained after paying the cost of serving model outputs (GPU time, data center, networking). At 45%, for every $1 of revenue, $0.45 is available to cover training costs. This is the unit economics floor of the business."],
                ["Revenue Growth (%/yr)", "Annual growth rate of the company's revenue run-rate, held flat across all generations (no acceleration assumed). This is compared against the Required Growth Rate to determine whether the treadmill is sustainable."],
                ["J-Curve", "Each model generation's cumulative P&L follows a J-curve: a sharp drop at t=0 when training cost hits (before any revenue), followed by a gradual climb as monthly gross profit accumulates. The curve must cross zero and ideally reach the next training cost threshold to self-fund."],
                ["Self-Funding", "A generation is self-funding if the gross profit accumulated during its dominance period equals or exceeds the training cost of the next generation. If not self-funding, the company must raise outside capital to train the next model — the venture treadmill."],
                ["Required ARR", "The minimum annual revenue run-rate needed at the end of a generation for its accumulated gross profit to cover the next gen's training cost. Formula: Required ARR = (Next Training Cost) / (Lifespan × Margin) × 12."],
                ["Toy Model Cost Assumption", "This model uses one effective multiplier for total training cost and does not separately model compute vs. non-compute components (for example: data, evals, personnel, and orchestration). Treat outputs as directional, not precise forecasts."],
              ].map(([term, def]) => (
                <div key={term} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#00D4FF", fontWeight: 700, marginBottom: 3 }}>{term}</div>
                  <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.6 }}>{def}</div>
                </div>
              ))}
            </div>

            {/* Algebra */}
            <div style={{ marginTop: 8, borderTop: "1px solid #1A2535", paddingTop: 16 }}>
              <div style={{ fontSize: 12, color: "#00FF94", fontWeight: 700, marginBottom: 12 }}>Core Algebra</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 32px" }}>
                {[
                  ["Initial Revenue (Gen 1, month 0)", "R_1,0 = initRevMM", "starting monthly revenue input in $mm/mo"],
                  ["Initial Training Cost (Gen 1)", "C_1 = initTrainMM", "base training cost input in $mm"],
                  ["Effective Cost Multiplier", "k_eff = (k / h) × 3", "k = scaling law multiplier, h = hardware efficiency offset"],
                  ["Raw Scaling Pressure (compute proxy)", "Compute_n ∝ k^(n−1)", "illustrative scaling-law pressure before hardware-efficiency adjustment"],
                  ["All-in Cost Proxy", "C_n = C_1 × k_eff^(n−1)", "toy assumption: compute and non-compute training costs are blended into one effective cost series"],
                  ["Monthly Revenue (Gen n, month m)", "R(n,m) = R_0 × (1+g_monthly)^m", "where g_monthly = (1+g_annual)^(1/12) − 1"],
                  ["Gross Profit (Gen n)", "GP_n = Σ R(n,m) × margin   [m=0..L]", "sum of monthly GP over dominance period L"],
                  ["Self-Funding Condition", "GP_n ≥ C_(n+1)", "GP this gen must cover NEXT gen's training cost"],
                  ["Required Growth Rate", "g_req = (C_(n+1) / (R_n × L × margin))^(12/L) − 1", "annual growth needed to self-fund next gen"],
                  ["Required ARR", "ARR_req = C_(n+1) / (L × margin) × 12", "revenue run-rate needed at start of gen to self-fund"],
                  ["Capital Gap", "Gap_n = max(0, C_(n+1) − GP_n)", "outside capital required if not self-funding"],
                  ["J-Curve at month m", "PnL(n,m) = −C_n + Σ R(n,t)×margin   [t=1..m]", "cumulative P&L: starts at −C_n, climbs over L months"],
                ].map(([name, formula, note]) => (
                  <div key={name} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#718096", marginBottom: 2 }}>{name}</div>
                    <div style={{ fontSize: 12, color: "#E8EAF0", fontWeight: 600, fontFamily: "monospace", background: "#060F1E", padding: "4px 8px", borderRadius: 4, marginBottom: 2 }}>{formula}</div>
                    <div style={{ fontSize: 10, color: "#374151" }}>{note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
