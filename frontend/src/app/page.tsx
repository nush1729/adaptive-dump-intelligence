"use client";
import React, { useEffect, useRef, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import { motion, useInView } from "framer-motion";
import gsap from "gsap";

const LandingHeroScene = dynamic(
  () => import("@/components/landing/LandingHeroScene"),
  { ssr: false }
);

const NAV_ROUTES: Record<string, string> = {
  "OVERVIEW": "/",
  "INTELLIGENCE ENGINE": "/intelligence",
  "LIVE SIMULATION": "/dashboard",
  "SYSTEM IMPACT": "/impact",
  "TEAM": "/team",
  "TECH STACK": "/tech-stack",
};
const NAV_LINKS = Object.keys(NAV_ROUTES);
const GOLD = "#f5b400";
const GOLD_DIM = "#a87900";
const GOLD_BRIGHT = "#ffc400";

/* ─── CountUp animation ──────────────────────────────────── */
function CountUp({ to, suffix = "", decimals = 0, delay = 0 }: {
  to: number; suffix?: string; decimals?: number; delay?: number;
}) {
  const [val, setVal] = useState(0);
  const startedRef = useRef(false);
  const nodeRef = useRef<HTMLSpanElement>(null);
  const inView = useInView(nodeRef, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView || startedRef.current) return;
    startedRef.current = true;
    const startTime = performance.now() + delay * 1000;
    const duration = 1400;
    const tick = (now: number) => {
      if (now < startTime) { requestAnimationFrame(tick); return; }
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(to * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to, delay]);

  const display = decimals === 0 ? Math.round(val).toLocaleString() : val.toFixed(decimals);
  return <span ref={nodeRef}>{display}{suffix}</span>;
}

/* ─── Sparkline / bar chart ──────────────────────────────── */
function Spark({ d, color, type = "line" }: { d: number[]; color: string; type?: "line" | "bar" }) {
  if (type === "bar") {
    const mx = Math.max(...d, 1);
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32, width: 54, flexShrink: 0 }}>
        {d.map((v, i) => (
          <div key={i} style={{
            flex: 1, borderRadius: "2px 2px 0 0",
            background: `linear-gradient(180deg, ${color} 0%, ${color}33 100%)`,
            height: `${(v / mx) * 100}%`,
            animation: `bar-grow .55s ease-out ${i * .07}s both`,
          }} />
        ))}
      </div>
    );
  }
  const W = 54, H = 32;
  const mn = Math.min(...d), mx = Math.max(...d), rng = mx - mn || 1;
  const pts = d.map((v, i) => `${(i / (d.length - 1)) * W},${H - ((v - mn) / rng) * (H - 6) - 3}`).join(" ");
  const lastArr = pts.split(" ").pop()!.split(",").map(Number);
  return (
    <svg width={W} height={H} style={{ overflow: "visible", flexShrink: 0 }}>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`${color}16`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastArr[0]} cy={lastArr[1]} r={2.5} fill={color} style={{ animation: "blink 2.2s ease-in-out infinite" }} />
    </svg>
  );
}

/* ─── Scroll-reveal wrapper ──────────────────────────────── */
function Reveal({ children, delay = 0, y = 36 }: { children: React.ReactNode; delay?: number; y?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div
      ref={ref}
      style={{
        transform: inView ? "translateY(0)" : `translateY(${y}px)`,
        opacity: inView ? 1 : 0,
        transition: `transform .7s cubic-bezier(.22,1,.36,1) ${delay}s, opacity .7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── CAT Dump Truck — realistic 3/4 perspective ───────────── */
function CatTruck({ scale = 1 }: { scale?: number }) {
  // Depth offset for 3/4 perspective top and front faces
  const DX = 28;   // how far the "depth" face extends right
  const DY = -12;  // how far it shifts up (foreshortening)

  return (
    <svg
      width={520 * scale}
      height={290 * scale}
      viewBox="0 0 520 290"
      fill="none"
      style={{
        filter:
          "drop-shadow(0 6px 28px rgba(255,205,17,0.55)) drop-shadow(0 2px 6px rgba(0,0,0,0.95)) drop-shadow(0 0 48px rgba(255,205,17,0.18))",
        overflow: "visible",
      }}
    >
      <defs>
        {/* ── Gradients ─────────────────────────────────────── */}
        {/* Yellow body side — lit from top-left */}
        <linearGradient id="yBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="28%"  stopColor="#FFCD11" />
          <stop offset="75%"  stopColor="#CC9C00" />
          <stop offset="100%" stopColor="#8A6600" />
        </linearGradient>
        {/* Yellow top face — brighter (direct light) */}
        <linearGradient id="yTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#FFF4A0" />
          <stop offset="100%" stopColor="#FFD700" />
        </linearGradient>
        {/* Yellow front/depth face — in shadow */}
        <linearGradient id="yFront" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#BB8C00" />
          <stop offset="100%" stopColor="#7A5A00" />
        </linearGradient>
        {/* Cab side gradient */}
        <linearGradient id="cabS" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="25%"  stopColor="#FFCD11" />
          <stop offset="70%"  stopColor="#C49000" />
          <stop offset="100%" stopColor="#806000" />
        </linearGradient>
        {/* Dark chassis/frame */}
        <linearGradient id="chassis" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#282010" />
          <stop offset="100%" stopColor="#080600" />
        </linearGradient>
        {/* Rock/ore material */}
        <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#5C4A30" />
          <stop offset="40%"  stopColor="#3A2E18" />
          <stop offset="100%" stopColor="#180E04" />
        </linearGradient>
        {/* Wheel tire — radial, lit from top */}
        <radialGradient id="tire" cx="38%" cy="30%" r="65%">
          <stop offset="0%"   stopColor="#2E2E1E" />
          <stop offset="55%"  stopColor="#151510" />
          <stop offset="100%" stopColor="#060604" />
        </radialGradient>
        {/* Wheel hub — metallic gold */}
        <radialGradient id="hub" cx="42%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#FFF080" />
          <stop offset="45%"  stopColor="#FFCD11" />
          <stop offset="80%"  stopColor="#CC9C00" />
          <stop offset="100%" stopColor="#7A5A00" />
        </radialGradient>
        {/* Small wheel hub (inner dual) */}
        <radialGradient id="hubSm" cx="42%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#FFE566" />
          <stop offset="100%" stopColor="#AA7A00" />
        </radialGradient>
        {/* Headlight glow */}
        <radialGradient id="hlGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#FFEE88" stopOpacity="1" />
          <stop offset="60%"  stopColor="#FFCD11" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FFCD11" stopOpacity="0" />
        </radialGradient>
        {/* Ground shadow */}
        <radialGradient id="gnd" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(0,0,0,0.65)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        {/* Glass window */}
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="rgba(140,200,255,0.38)" />
          <stop offset="50%"  stopColor="rgba(80,140,200,0.18)" />
          <stop offset="100%" stopColor="rgba(20,60,110,0.1)" />
        </linearGradient>
        {/* Specular highlight strip */}
        <linearGradient id="spec" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        {/* Bed inner shadow */}
        <linearGradient id="bedShadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(0,0,0,0.6)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>

      {/* ── Ground shadow ─────────────────────────────────── */}
      <ellipse cx="258" cy="280" rx="210" ry="13" fill="url(#gnd)" />

      {/* ════════════════════════════════════════
          REAR WHEELS  (painted first — behind body)
      ════════════════════════════════════════ */}
      {/* Inner dual wheel (offset, slightly behind) */}
      <g opacity="0.72">
        <circle cx="362" cy="228" r="40" fill="url(#tire)" stroke="#1A1A10" strokeWidth="2" />
        <circle cx="362" cy="228" r="26" fill="none" stroke="#252514" strokeWidth="2.5" />
        <circle cx="362" cy="228" r="16" fill="url(#hubSm)" />
        <circle cx="362" cy="228" r="6"  fill="#FFCD11" />
        {/* Lug bolts */}
        {[0,72,144,216,288].map(a=>{
          const r=a*Math.PI/180;
          return <circle key={a} cx={362+11*Math.cos(r)} cy={228+11*Math.sin(r)} r={2.5} fill="#AA7A00" />;
        })}
      </g>
      {/* Main rear wheel */}
      <g>
        <circle cx="326" cy="230" r="46" fill="url(#tire)" stroke="#111108" strokeWidth="2.5" />
        {/* Tire sidewall rings */}
        <circle cx="326" cy="230" r="40" fill="none" stroke="#1C1C12" strokeWidth="3.5" />
        <circle cx="326" cy="230" r="34" fill="none" stroke="#222216" strokeWidth="1" />
        {/* Hub ring */}
        <circle cx="326" cy="230" r="24" fill="none" stroke="#AA8800" strokeWidth="2" />
        {/* Hub */}
        <circle cx="326" cy="230" r="20" fill="url(#hub)" />
        {/* Highlight on hub */}
        <ellipse cx="320" cy="224" rx="11" ry="8" fill="rgba(255,248,160,0.28)" />
        {/* Center boss */}
        <circle cx="326" cy="230" r="7"  fill="#CC9C00" />
        <circle cx="326" cy="230" r="4"  fill="#FFCD11" />
        <circle cx="326" cy="230" r="1.5" fill="rgba(255,255,255,0.6)" />
        {/* Lug nuts */}
        {[0,60,120,180,240,300].map(a=>{
          const r=a*Math.PI/180;
          return (
            <g key={a}>
              <circle cx={326+14*Math.cos(r)} cy={230+14*Math.sin(r)} r={3.5} fill="#CC9C00" stroke="#FFCD11" strokeWidth="0.8" />
              <circle cx={326+14*Math.cos(r)} cy={230+14*Math.sin(r)} r={1.5} fill="#FFE566" />
            </g>
          );
        })}
        {/* Spokes */}
        {[30,90,150,210,270,330].map(a=>{
          const r=a*Math.PI/180;
          return <line key={a} x1={326+9*Math.cos(r)} y1={230+9*Math.sin(r)} x2={326+37*Math.cos(r)} y2={230+37*Math.sin(r)} stroke="#1A1A10" strokeWidth="2" />;
        })}
        {/* Tire top highlight */}
        <path d="M 292,196 Q 326,186 360,198" stroke="rgba(255,255,255,0.16)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="308" cy="198" rx="9" ry="5" fill="rgba(255,255,255,0.1)" transform="rotate(-18,308,198)" />
        {/* AO under wheel */}
        <ellipse cx="326" cy="274" rx="52" ry="7" fill="rgba(0,0,0,0.55)" />
      </g>

      {/* ════════════════════════════════════════
          REAR AXLE / SUSPENSION HOUSING
      ════════════════════════════════════════ */}
      <rect x="280" y="212" width="115" height="16" rx="3" fill="url(#chassis)" stroke="#332800" strokeWidth="1" />
      {/* Depth face of axle */}
      <polygon points={`395,212 ${395+DX},${212+DY} ${395+DX},${228+DY} 395,228`}
        fill="#1A1200" opacity="0.6" />

      {/* ════════════════════════════════════════
          MAIN CHASSIS FRAME  (dark lower sill)
      ════════════════════════════════════════ */}
      {/* Top face of chassis (3D top strip) */}
      <polygon
        points={`52,176 420,170 ${420+DX},${170+DY} ${52+DX},${176+DY}`}
        fill="url(#yTop)" opacity="0.55"
      />
      {/* Side face */}
      <rect x="52" y="176" width="368" height="58" fill="url(#chassis)" />
      {/* Front face of chassis */}
      <polygon
        points={`420,170 ${420+DX},${170+DY} ${420+DX},${234+DY} 420,234`}
        fill="#0F0C00" opacity="0.8"
      />
      {/* Panel lines on chassis */}
      <line x1="130" y1="178" x2="130" y2="232" stroke="rgba(255,200,0,0.1)" strokeWidth="1" />
      <line x1="220" y1="178" x2="220" y2="232" stroke="rgba(255,200,0,0.08)" strokeWidth="1" />
      <line x1="310" y1="178" x2="310" y2="232" stroke="rgba(255,200,0,0.08)" strokeWidth="1" />
      {/* Running board */}
      <rect x="52" y="178" width="368" height="5" fill="rgba(255,220,50,0.18)" />

      {/* ════════════════════════════════════════
          DUMP BED STRUCTURE
      ════════════════════════════════════════ */}
      {/* Bed REAR face (3D face on right) */}
      <polygon
        points={`420,46 ${420+DX},${46+DY} ${420+DX},${170+DY} 420,170`}
        fill="url(#yFront)"
      />
      {/* Bed TOP face (visible top edge, 3D) */}
      <polygon
        points={`80,42 420,42 ${420+DX},${42+DY} ${80+DX},${42+DY}`}
        fill="url(#yTop)"
      />
      {/* Bed SIDE face (main view) */}
      <polygon points="80,42 420,42 420,170 80,176" fill="url(#yBody)" />

      {/* Bed structural ribs */}
      {[134,182,230,278,326,374].map(x => (
        <line key={x} x1={x} y1={46} x2={x+3} y2={168}
          stroke="rgba(0,0,0,0.28)" strokeWidth="1.8" />
      ))}
      {/* Horizontal structural brace mid-bed */}
      <line x1="80" y1="108" x2="420" y2="106" stroke="rgba(0,0,0,0.22)" strokeWidth="2.5" />

      {/* Bed top flange (bright gold bar) */}
      <rect x="80" y="42" width="340" height="6" rx="1" fill="#FFF480" />
      {/* Specular streak on top flange */}
      <rect x="82" y="42" width="160" height="2.5" rx="1" fill="rgba(255,255,255,0.55)" />
      {/* Bed bottom flange */}
      <rect x="80" y="166" width="340" height="7" rx="1" fill="#AA8800" />

      {/* Bed specular highlight (upper-left) */}
      <polygon points="84,48 220,44 225,60 88,64" fill="url(#spec)" opacity="0.7" />

      {/* Bed interior upper shadow */}
      <polygon points="85,50 418,50 418,80 85,82" fill="url(#bedShadow)" />

      {/* Rock/ore load in bed */}
      <polygon points="86,52 418,52 418,164 88,168" fill="url(#rock)" />
      {/* Rock surface detail */}
      <polygon points="86,52 418,52 418,78 88,80" fill="rgba(90,68,40,0.45)" />
      {/* Rock surface highlight */}
      <path d="M 92,62 Q 180,54 270,60 Q 340,65 410,58"
        stroke="rgba(200,155,80,0.55)" strokeWidth="1.8" fill="none" />
      <path d="M 100,72 Q 200,66 310,70 Q 380,73 412,68"
        stroke="rgba(140,105,55,0.3)" strokeWidth="1" fill="none" />

      {/* ════════════════════════════════════════
          FRONT AXLE / SUSPENSION
      ════════════════════════════════════════ */}
      <rect x="65" y="212" width="90" height="16" rx="3" fill="url(#chassis)" stroke="#332800" strokeWidth="1" />

      {/* ════════════════════════════════════════
          CAB  (leftmost, foreground)
      ════════════════════════════════════════ */}
      {/* Cab base step */}
      <rect x="22" y="155" width="72" height="24" rx="2" fill="url(#chassis)" />
      <rect x="22" y="155" width="72" height="4" fill="rgba(255,220,50,0.2)" />

      {/* Cab ROOF top face (3D) */}
      <polygon
        points={`22,66 110,66 ${110+DX},${66+DY} ${22+DX},${66+DY}`}
        fill="url(#yTop)"
      />
      {/* Cab right depth face */}
      <polygon
        points={`110,66 ${110+DX},${66+DY} ${110+DX},${179+DY} 110,179`}
        fill="url(#yFront)"
      />
      {/* Cab main side */}
      <rect x="22" y="66" width="88" height="113" rx="3" fill="url(#cabS)" />
      {/* Specular streak top of cab */}
      <polygon points="22,66 110,66 110,82 22,86" fill="url(#spec)" opacity="0.6" />
      {/* Cab panel line (door) */}
      <line x1="70" y1="80" x2="70" y2="178" stroke="rgba(0,0,0,0.35)" strokeWidth="1.8" />
      {/* Cab door handle */}
      <rect x="60" y="132" width="12" height="4" rx="2" fill="#AA8800" />

      {/* === Windshield === */}
      <rect x="29" y="77" width="70" height="44" rx="3"
        fill="url(#glass)" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      {/* Windshield A-pillar left */}
      <rect x="29" y="77" width="4" height="44" fill="rgba(0,0,0,0.45)" />
      {/* Windshield A-pillar right */}
      <rect x="95" y="77" width="4" height="44" fill="rgba(0,0,0,0.35)" />
      {/* Glass glare highlight */}
      <polygon points="34,79 68,77 64,97 38,101" fill="rgba(255,255,255,0.2)" />
      {/* Wiper */}
      <line x1="34" y1="118" x2="90" y2="110" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinecap="round" />

      {/* Side window */}
      <rect x="29" y="126" width="38" height="22" rx="2"
        fill="url(#glass)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" opacity="0.75" />
      <rect x="71" y="126" width="24" height="22" rx="2"
        fill="url(#glass)" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" opacity="0.6" />

      {/* === Front grill panel === */}
      <rect x="6" y="90" width="20" height="66" rx="2" fill="#090700" stroke="#2A2000" strokeWidth="1" />
      {/* Grill top 3D face */}
      <polygon points="6,90 26,90 30,95 10,95" fill="#222010" />
      {/* Grill louvers */}
      {[96,103,110,117,124,131,138,145].map(y => (
        <rect key={y} x="8" y={y} width="16" height="3.5" rx="0.5"
          fill="#181408" stroke="#333020" strokeWidth="0.4" />
      ))}
      {/* Grill center mesh shadow */}
      <rect x="8" y="96" width="16" height="58" fill="rgba(0,0,0,0.3)" />

      {/* === Headlights === */}
      {/* Upper headlight */}
      <ellipse cx="9" cy="90" rx="5.5" ry="7" fill="#FFEE88" />
      <ellipse cx="9" cy="90" rx="10" ry="12" stroke="#FFCD11" strokeWidth="0.6" fill="none" opacity="0.5" />
      {/* Lens glare */}
      <ellipse cx="7" cy="88" rx="2.5" ry="3.5" fill="rgba(255,255,255,0.75)" />
      {/* Headlight glow spread */}
      <ellipse cx="9" cy="90" rx="20" ry="22" fill="url(#hlGlow)" opacity="0.5"
        style={{ animation: "blink 2.6s ease-in-out infinite" }} />

      {/* Lower fog light */}
      <ellipse cx="9" cy="114" rx="4.5" ry="5.5" fill="#FFEE88" opacity="0.85" />
      <ellipse cx="7.5" cy="112" rx="2" ry="2.8" fill="rgba(255,255,255,0.65)" />

      {/* === Bumper === */}
      <rect x="6" y="160" width="20" height="18" rx="1" fill="#1A1400" stroke="#332800" strokeWidth="1" />
      <rect x="6" y="160" width="20" height="3" fill="rgba(255,200,0,0.3)" />
      {/* Tow hook */}
      <rect x="11" y="172" width="10" height="6" rx="1" fill="#0A0800" stroke="#555" strokeWidth="0.8" />

      {/* === CAT Badge === */}
      <rect x="36" y="118" width="50" height="16" rx="2" fill="#FFCD11" />
      <rect x="36" y="118" width="50" height="5" rx="1" fill="#FFE566" opacity="0.6" />
      <text x="61" y="130" textAnchor="middle"
        fontFamily="Arial Black, Arial" fontWeight="900" fontSize="10.5"
        fill="#000" letterSpacing="0.12em">CAT</text>

      {/* === Exhaust stacks === */}
      <rect x="76" y="44" width="7" height="28" rx="3.5" fill="#242424" stroke="#FFCD1166" strokeWidth="0.8" />
      <ellipse cx="79.5" cy="44" rx="4.5" ry="3" fill="#1A1A1A" stroke="#FFCD11" strokeWidth="0.7" />
      <rect x="87" y="36" width="8" height="36" rx="4" fill="#242424" stroke="#FFCD1166" strokeWidth="0.8" />
      <ellipse cx="91" cy="36" rx="5" ry="3" fill="#1A1A1A" stroke="#FFCD11" strokeWidth="0.7" />
      {/* Smoke puffs */}
      {[0,1,2,3].map(i => (
        <ellipse key={i} cx={82+i*3.5} cy={30-i*9} rx={4+i*2.5} ry={5+i*2.5}
          fill={`rgba(55,55,40,${0.28-i*0.06})`}
          style={{ animation: `float-smoke ${2.4+i*.45}s ease-out infinite ${i*.38}s` }} />
      ))}

      {/* ════════════════════════════════════════
          TAIL LIGHTS
      ════════════════════════════════════════ */}
      <g>
        <rect x="412" y="100" width="8" height="16" rx="2" fill="#FF1C1C" opacity="0.9" />
        <rect x="412" y="118" width="8" height="10" rx="2" fill="#FF6600" opacity="0.8" />
        {/* Red glow */}
        <ellipse cx="416" cy="108" rx="14" ry="11" fill="rgba(255,40,40,0.22)"
          style={{ animation: "blink 3.2s ease-in-out infinite" }} />
      </g>

      {/* ════════════════════════════════════════
          FRONT WHEEL  (foreground — most detailed)
      ════════════════════════════════════════ */}
      <g>
        {/* AO shadow under wheel */}
        <ellipse cx="104" cy="274" rx="56" ry="8" fill="rgba(0,0,0,0.6)" />
        {/* Tire body */}
        <circle cx="104" cy="232" r="50" fill="url(#tire)" stroke="#111108" strokeWidth="3" />
        {/* Tire sidewall rings */}
        <circle cx="104" cy="232" r="44" fill="none" stroke="#1C1C12" strokeWidth="4" />
        <circle cx="104" cy="232" r="38" fill="none" stroke="#222218" strokeWidth="1.5" />
        {/* Tread lettering zone */}
        <circle cx="104" cy="232" r="47" fill="none" stroke="#181812" strokeWidth="2"
          strokeDasharray="8 4" />
        {/* Hub ring (outer) */}
        <circle cx="104" cy="232" r="28" fill="none" stroke="#AA8800" strokeWidth="2.5" />
        {/* Hub disc */}
        <circle cx="104" cy="232" r="24" fill="url(#hub)" />
        {/* Hub face highlight */}
        <ellipse cx="97" cy="225" rx="14" ry="10" fill="rgba(255,248,150,0.32)" />
        {/* Center boss */}
        <circle cx="104" cy="232" r="9" fill="#CC9C00" />
        <circle cx="104" cy="232" r="6" fill="#FFCD11" />
        <circle cx="104" cy="232" r="2.5" fill="rgba(255,255,255,0.65)" />
        {/* Lug nuts — 6 × detailed */}
        {[0,60,120,180,240,300].map(a => {
          const rad = a * Math.PI / 180;
          const bx = 104 + 17*Math.cos(rad);
          const by = 232 + 17*Math.sin(rad);
          return (
            <g key={a}>
              <circle cx={bx} cy={by} r={4.5} fill="#CC9C00" stroke="#FFCD11" strokeWidth="1" />
              <circle cx={bx} cy={by} r={2}   fill="#FFE566" />
            </g>
          );
        })}
        {/* Spokes */}
        {[30,90,150,210,270,330].map(a => {
          const rad = a * Math.PI / 180;
          return (
            <line key={a}
              x1={104 + 11*Math.cos(rad)} y1={232 + 11*Math.sin(rad)}
              x2={104 + 40*Math.cos(rad)} y2={232 + 40*Math.sin(rad)}
              stroke="#1A1A10" strokeWidth="2.5" />
          );
        })}
        {/* Tire top highlight */}
        <path d="M 62,196 Q 104,184 146,198"
          stroke="rgba(255,255,255,0.18)" strokeWidth="5" fill="none" strokeLinecap="round" />
        {/* Specular shine spot */}
        <ellipse cx="80" cy="198" rx="11" ry="6" fill="rgba(255,255,255,0.12)"
          transform="rotate(-22,80,198)" />
        {/* Sidewall text area marks */}
        {[210,270,330].map(a => {
          const rad = a * Math.PI / 180;
          return (
            <line key={a}
              x1={104 + 42*Math.cos(rad)} y1={232 + 42*Math.sin(rad)}
              x2={104 + 46*Math.cos(rad)} y2={232 + 46*Math.sin(rad)}
              stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
          );
        })}
      </g>

      {/* ════════════════════════════════════════
          RUNNING LIGHTS
      ════════════════════════════════════════ */}
      {[150,195,242,290,340,385].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy={190} r={2.8} fill="#FFCD11"
            opacity={0.3 + (i % 2) * 0.2}
            style={{ animation: `blink ${1.9+i*.28}s ease-in-out infinite ${i*.2}s` }} />
          <circle cx={x} cy={190} r={5} fill="#FFCD11" opacity="0.06" />
        </g>
      ))}

      {/* ════════════════════════════════════════
          FINAL DEPTH CUES
      ════════════════════════════════════════ */}
      {/* Bottom chassis shadow line */}
      <line x1="52" y1="234" x2="420" y2="234" stroke="rgba(0,0,0,0.7)" strokeWidth="3" />
      {/* Bed-body junction shadow */}
      <line x1="80" y1="174" x2="420" y2="170" stroke="rgba(0,0,0,0.65)" strokeWidth="3.5" />
      {/* Step plates */}
      <rect x="22" y="175" width="28" height="5" rx="1" fill="#CC9C00" />
      <rect x="54" y="175" width="20" height="5" rx="1" fill="#AA8800" />
      {/* Body top bright edge */}
      <line x1="52" y1="177" x2="420" y2="171"
        stroke="rgba(255,235,80,0.22)" strokeWidth="1.5" />
    </svg>
  );
}

/* ─── Terrain hologram panel ─────────────────────────────── */
function TerrainHolo() {
  return (
    <div style={{
      background: "rgba(3,5,5,0.94)",
      border: `1px solid rgba(245,180,0,0.48)`,
      borderRadius: 3,
      overflow: "hidden",
      backdropFilter: "blur(18px)",
      width: 268,
      position: "relative",
      boxShadow: `0 0 32px rgba(245,180,0,0.12), 0 0 2px rgba(245,180,0,0.3)`,
    }}>
      {/* HUD corners */}
      {(["tl", "tr", "bl", "br"] as const).map(p => {
        const s: React.CSSProperties = { position: "absolute", width: 12, height: 12, zIndex: 2 };
        if (p === "tl") { s.top = 0; s.left = 0; s.borderTop = `2px solid ${GOLD}`; s.borderLeft = `2px solid ${GOLD}`; }
        if (p === "tr") { s.top = 0; s.right = 0; s.borderTop = `2px solid ${GOLD}`; s.borderRight = `2px solid ${GOLD}`; }
        if (p === "bl") { s.bottom = 0; s.left = 0; s.borderBottom = `2px solid ${GOLD}`; s.borderLeft = `2px solid ${GOLD}`; }
        if (p === "br") { s.bottom = 0; s.right = 0; s.borderBottom = `2px solid ${GOLD}`; s.borderRight = `2px solid ${GOLD}`; }
        return <div key={p} style={s} />;
      })}
      {/* Header */}
      <div style={{
        padding: "5px 14px", borderBottom: `1px solid rgba(245,180,0,0.14)`,
        display: "flex", alignItems: "center", gap: 8, background: "rgba(245,180,0,0.04)",
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, animation: "blink 1.4s ease-in-out infinite", boxShadow: `0 0 8px ${GOLD}` }} />
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.7rem", color: GOLD, letterSpacing: "0.22em", textTransform: "uppercase" }}>Terrain Scan</span>
        <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono',monospace", fontSize: "0.65rem", color: `${GOLD}88`, letterSpacing: "0.12em" }}>ACTIVE</span>
      </div>
      {/* Terrain SVG */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        <svg width="268" height="105" viewBox="0 0 268 105" fill="none" style={{ display: "block" }}>
          {[21, 42, 63, 84].map(y => <line key={y} x1="0" y1={y} x2="268" y2={y} stroke={GOLD} strokeWidth="0.25" opacity="0.1" />)}
          {[54, 107, 161, 214].map(x => <line key={x} x1={x} y1="0" x2={x} y2="105" stroke={GOLD} strokeWidth="0.25" opacity="0.1" />)}
          <polygon
            points="0,105 0,79 24,70 46,62 66,66 84,53 106,46 124,38 140,31 156,38 170,46 186,37 204,27 222,36 236,46 252,55 268,62 268,105"
            fill={`${GOLD}08`}
          />
          <polyline
            points="0,79 24,70 46,62 66,66 84,53 106,46 124,38 140,31 156,38 170,46 186,37 204,27 222,36 236,46 252,55 268,62"
            stroke={GOLD} strokeWidth="1.7" fill="none" opacity="0.95"
          />
          <polyline
            points="0,87 24,79 46,72 66,75 84,63 106,57 124,50 140,44 156,51 170,59 186,52 204,41 222,50 236,59 252,66 268,72"
            stroke={GOLD} strokeWidth="0.7" fill="none" opacity="0.28"
          />
          <circle cx="204" cy="27" r="5.5" fill={GOLD} opacity="0.95" />
          <circle cx="204" cy="27" r="11" stroke={GOLD} strokeWidth="0.8" fill="none" opacity="0.48" />
          <circle cx="204" cy="27" r="19" stroke={GOLD} strokeWidth="0.4" fill="none" opacity="0.2" />
          <line x1="204" y1="0" x2="204" y2="105" stroke={GOLD} strokeWidth="0.5" opacity="0.16" strokeDasharray="3 5" />
          <line x1="0" y1="27" x2="268" y2="27" stroke={GOLD} strokeWidth="0.5" opacity="0.16" strokeDasharray="3 5" />
          {/* Vertical scan beam */}
          <line x1="204" y1="27" x2="204" y2="105" stroke={GOLD} strokeWidth="2.2" opacity="0.6" strokeDasharray="2 3" style={{ animation: "blink 1.8s ease-in-out infinite" }} />
        </svg>
        <div style={{
          position: "absolute", top: 0, bottom: 0, width: "4px",
          background: `linear-gradient(to bottom, transparent, ${GOLD}bb, transparent)`,
          animation: "scan-sweep 3s linear infinite",
          borderRadius: 2,
        }} />
      </div>
      {/* Footer data */}
      <div style={{ padding: "5px 14px", display: "flex", justifyContent: "space-between", borderTop: `1px solid rgba(245,180,0,0.1)` }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.62rem", color: `${GOLD}66`, letterSpacing: "0.1em" }}>ELEV 247m</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.62rem", color: `${GOLD}55`, letterSpacing: "0.1em" }}>100×100 GRID</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.62rem", color: `${GOLD}44`, letterSpacing: "0.1em" }}>PPO ACTIVE</span>
      </div>
    </div>
  );
}

/* ─── Process step icons ─────────────────────────────────── */
function PIcon({ type }: { type: string }) {
  if (type === "sense") return (
    <svg width="76" height="58" viewBox="0 0 76 58" fill="none">
      <polygon points="38,4 68,52 8,52" stroke={GOLD} strokeWidth="1" opacity="0.22" fill={`${GOLD}04`} />
      <polygon points="38,13 58,49 18,49" stroke={GOLD} strokeWidth="1" opacity="0.44" fill={`${GOLD}05`} />
      <polygon points="38,24 50,47 26,47" stroke={GOLD} strokeWidth="1.3" opacity="0.82" fill={`${GOLD}0a`} />
      <circle cx="38" cy="36" r="3.5" fill={GOLD} />
      <circle cx="38" cy="36" r="8" stroke={GOLD} strokeWidth="0.5" fill="none" opacity="0.3" />
    </svg>
  );
  if (type === "analyze") return (
    <svg width="76" height="58" viewBox="0 0 76 58" fill="none">
      {[[38, 29, 24], [38, 29, 15], [38, 29, 7]].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} stroke={GOLD}
          strokeWidth={i === 2 ? 1.2 : 0.65} opacity={[0.18, 0.4, 0.88][i]} fill={i === 2 ? `${GOLD}12` : "none"} />
      ))}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => {
        const rad = a * Math.PI / 180, d = 15;
        return <circle key={i} cx={38 + d * Math.cos(rad)} cy={29 + d * Math.sin(rad)} r={i % 2 === 0 ? 2.8 : 1.6} fill={GOLD} opacity={i % 2 === 0 ? 0.9 : 0.42} />;
      })}
      <circle cx="38" cy="29" r="4.5" fill={GOLD} />
    </svg>
  );
  if (type === "decide") return (
    <svg width="76" height="58" viewBox="0 0 76 58" fill="none">
      <circle cx="38" cy="29" r="23" stroke={GOLD} strokeWidth="0.5" opacity="0.18" fill={`${GOLD}04`} />
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a, i) => {
        const rad = a * Math.PI / 180, d = 17;
        return <line key={i} x1={38 + d * 0.48 * Math.cos(rad)} y1={29 + d * 0.48 * Math.sin(rad)}
          x2={38 + d * Math.cos(rad)} y2={29 + d * Math.sin(rad)}
          stroke={GOLD} strokeWidth={i % 3 === 0 ? 1.2 : 0.5} opacity={i % 3 === 0 ? 0.85 : 0.3} />;
      })}
      <circle cx="38" cy="29" r="9" stroke={GOLD} strokeWidth="1.3" opacity="0.72" fill={`${GOLD}16`} />
      <circle cx="38" cy="29" r="4.5" fill={GOLD} opacity="0.95" />
    </svg>
  );
  if (type === "dispatch") return (
    <svg width="76" height="58" viewBox="0 0 76 58" fill="none">
      <rect x="6" y="26" width="48" height="20" rx="2" fill={`${GOLD}0e`} stroke={GOLD} strokeWidth="1.1" opacity="0.72" />
      <rect x="6" y="19" width="22" height="14" rx="2" fill={`${GOLD}08`} stroke={GOLD} strokeWidth="0.9" opacity="0.62" />
      <rect x="44" y="21" width="14" height="11" rx="1.5" fill={`${GOLD}08`} stroke={GOLD} strokeWidth="0.75" opacity="0.5" />
      <circle cx="17" cy="48" r="8" stroke={GOLD} strokeWidth="1.8" fill="#090700" opacity="0.88" />
      <circle cx="17" cy="48" r="3.5" fill={GOLD} opacity="0.82" />
      <circle cx="43" cy="48" r="8" stroke={GOLD} strokeWidth="1.8" fill="#090700" opacity="0.88" />
      <circle cx="43" cy="48" r="3.5" fill={GOLD} opacity="0.82" />
      {/* Arrow forward */}
      <path d="M 62,30 L 72,29 L 68,25 M 72,29 L 68,33" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
  // adapt — infinity with orbiting particles
  return (
    <svg width="76" height="58" viewBox="0 0 76 58" fill="none">
      <path d="M 16,29 C 16,19 26,14 34,19 C 42,24 34,34 26,34 C 18,34 12,29 16,29 Z M 60,29 C 60,19 50,14 42,19 C 34,24 42,34 50,34 C 58,34 64,29 60,29 Z"
        stroke={GOLD} strokeWidth="1.6" opacity="0.82" fill={`${GOLD}0a`} />
      {[0, 72, 144, 216, 288].map((a, i) => {
        const rad = a * Math.PI / 180;
        return <circle key={i} cx={38 + 13 * Math.cos(rad)} cy={29 + 13 * Math.sin(rad)} r={2}
          fill={GOLD} opacity={0.28 + i * 0.15} style={{ animation: `blink ${1.6 + i * .32}s ease-in-out infinite ${i * .22}s` }} />;
      })}
      <circle cx="38" cy="29" r="4" fill={GOLD} opacity="0.9" />
    </svg>
  );
}

/* ─── Data ───────────────────────────────────────────────── */
const METRICS = [
  { icon: "⬡", label: "FLEET EFFICIENCY", to: 92.7, suffix: "%", delta: "↑ 8.6%", pos: true, d: [60, 65, 58, 72, 68, 80, 79, 88, 92], t: "line" as const },
  { icon: "◈", label: "DISPATCH OPTIMIZATION", to: 98.3, suffix: "%", delta: "↑ 11.2%", pos: true, d: [4, 6, 5, 8, 7, 10, 9, 11, 10], t: "bar" as const },
  { icon: "◉", label: "TERRAIN ADAPTATION", to: 120, suffix: "ms", delta: "↓ 15ms", pos: true, d: [180, 165, 155, 148, 140, 130, 125, 122, 120], t: "line" as const },
  { icon: "◧", label: "IDLE TIME REDUCTION", to: 36.4, suffix: "%", delta: "↑ 6.8%", pos: false, d: [43, 41, 38, 37, 35, 34, 36, 33, 35], t: "line" as const },
  { icon: "◑", label: "FUEL OPTIMIZATION", to: 18.7, suffix: "%", delta: "↑ 3.2%", pos: true, d: [12, 13, 14, 15, 16, 17, 17, 18, 18], t: "line" as const },
  { icon: "◈", label: "RL TRAINING ITERS", to: 2.43, suffix: "M", delta: "↑ 120K", pos: true, d: [3, 5, 4, 7, 6, 9, 8, 10, 11], t: "bar" as const, decimals: 2 },
];

const STEPS = [
  { n: "01", label: "SENSE", desc: "Real-time data from terrain, fleet & environment", type: "sense" },
  { n: "02", label: "ANALYZE", desc: "AI models evaluate terrain, load & traffic", type: "analyze" },
  { n: "03", label: "DECIDE", desc: "RL engine determines optimal actions", type: "decide" },
  { n: "04", label: "DISPATCH", desc: "Smart dispatch to the right truck, right time", type: "dispatch" },
  { n: "05", label: "ADAPT", desc: "Continuous learning improves every cycle", type: "adapt" },
];

const FEATURES = [
  { icon: "◎", title: "AUTONOMOUS READY", desc: "Designed for future autonomous mining ecosystems." },
  { icon: "◈", title: "INDUSTRIAL GRADE", desc: "Built for reliability in extreme environments." },
  { icon: "◉", title: "REAL-TIME INTELLIGENCE", desc: "Millisecond-level decisions that drive impact." },
  { icon: "⬡", title: "SCALABLE ARCHITECTURE", desc: "Cloud-native. Edge-ready. Future-proof." },
];

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".gn", { opacity: 0, y: -26, duration: 0.65, ease: "power2.out" });
      gsap.from(".gl", { y: 70, opacity: 0, duration: 0.82, stagger: 0.075, delay: 0.22, ease: "back.out(1.55)" });
      gsap.from(".gs", { y: 18, opacity: 0, duration: 0.68, delay: 0.72, ease: "power3.out" });
      gsap.from(".gd", { y: 14, opacity: 0, duration: 0.55, delay: 0.94, ease: "power3.out" });
      gsap.from(".gb", { y: 16, opacity: 0, duration: 0.5, stagger: 0.1, delay: 1.08, ease: "power3.out" });
      gsap.from(".gm", { x: 28, opacity: 0, duration: 0.5, stagger: 0.07, delay: 0.48, ease: "power2.out" });
      gsap.from(".ghud", { scale: 0.86, opacity: 0, duration: 0.62, stagger: 0.13, delay: 0.62, ease: "back.out(1.3)" });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      style={{
        background: "#030505",
        minHeight: "100vh",
        color: "#f5f5f5",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <style>{`
        @keyframes blink       { 0%,100%{opacity:1}  50%{opacity:0.15} }
        @keyframes scan-sweep  { 0%{left:-4%;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{left:106%;opacity:0} }
        @keyframes ring-pulse  { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.48} 50%{transform:translate(-50%,-50%) scale(1.08);opacity:0.1} }
        @keyframes float-up    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes glow-core   { 0%,100%{box-shadow:0 0 12px #f5b40088} 50%{box-shadow:0 0 30px #f5b400,0 0 60px #f5b40044} }
        @keyframes truck-ping  { 0%{transform:scale(1);opacity:0.8} 100%{transform:scale(3.5);opacity:0} }
        @keyframes particle    { 0%,100%{transform:translateY(0) scale(1);opacity:0.18} 50%{transform:translateY(-26px) scale(1.4);opacity:0.62} }
        @keyframes bar-grow    { from{transform:scaleY(0);transform-origin:bottom} to{transform:scaleY(1)} }
        @keyframes float-smoke { 0%{opacity:0.28;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-24px) scale(2.3)} }
        @keyframes spin-ring   { to{transform:translate(-50%,-50%) rotate(360deg)} }
        @keyframes spin-ring-r { to{transform:translate(-50%,-50%) rotate(-360deg)} }
        @keyframes dash-arrow  { to{stroke-dashoffset:-20} }
        @keyframes fadeIn      { from{opacity:0} to{opacity:1} }
        @keyframes road-glow   { 0%,100%{opacity:0.55} 50%{opacity:0.9} }

        .nl:hover { color:#f5b400 !important; }
        .nl { transition:color .18s; }
        .sc { transition:all .25s ease !important; }
        .sc:hover {
          transform:translateY(-8px) !important;
          box-shadow:0 12px 40px rgba(245,180,0,0.22), 0 0 0 1px rgba(245,180,0,0.32) !important;
          border-color:rgba(245,180,0,0.36) !important;
        }
        .feat-card { transition: all 0.22s ease; }
        .feat-card:hover {
          transform:translateY(-4px);
          border-color:rgba(245,180,0,0.3) !important;
          background:rgba(245,180,0,0.04) !important;
        }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-thumb { background:rgba(245,180,0,0.25); border-radius:2px; }
      `}</style>

      {/* ═══════════════════════════════════════
          NAVBAR
      ═══════════════════════════════════════ */}
      <nav
        className="gn"
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
          height: 76,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 32px",
          background: "rgba(3,5,5,0.97)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(22px)",
        }}
      >
        {/* Top gold accent line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "2px",
          background: `linear-gradient(90deg, transparent 0%, ${GOLD}88 20%, ${GOLD}cc 50%, ${GOLD}88 80%, transparent 100%)`,
        }} />

        {/* Logo */}
        <div
          onClick={() => router.push("/")}
          style={{ display: "flex", alignItems: "flex-end", gap: 10, cursor: "pointer", flexShrink: 0 }}
        >
          <div style={{ display: "flex", alignItems: "baseline" }}>
            {"ADIOS".split("").map((ch, i) => (
              <span key={i} style={{
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 900,
                fontSize: "1.55rem",
                letterSpacing: "0.1em",
                color: ch === "O" || ch === "S" ? GOLD : "#ffffff",
                textShadow: ch === "O" || ch === "S" ? `0 0 20px ${GOLD}99` : "none",
              }}>{ch}</span>
            ))}
          </div>
          <div style={{ paddingBottom: 2 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.62rem", color: "#4b5563", letterSpacing: "0.18em", textTransform: "uppercase", lineHeight: 1.3 }}>ADAPTIVE INTELLIGENCE</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.62rem", color: "#4b5563", letterSpacing: "0.18em", textTransform: "uppercase", lineHeight: 1.3 }}>SYSTEM</div>
          </div>
        </div>

        {/* Center nav */}
        <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
          {NAV_LINKS.map(link => {
            const active = pathname === NAV_ROUTES[link];
            return (
              <button
                key={link}
                className="nl"
                onClick={() => router.push(NAV_ROUTES[link])}
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: "0.78rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: active ? GOLD : "#9ca3af",
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: "8px 12px",
                  borderBottom: active ? `2px solid ${GOLD}` : "2px solid transparent",
                  transition: "all 0.18s",
                }}
              >
                {link}
              </button>
            );
          })}
        </div>

        {/* Right CTA */}
        <motion.button
          onClick={() => router.push("/dashboard")}
          whileHover={{ background: GOLD, color: "#000", boxShadow: `0 0 28px ${GOLD}88` }}
          style={{
            fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
            fontSize: "0.81rem", letterSpacing: "0.18em", textTransform: "uppercase",
            color: GOLD, background: "transparent",
            border: `1px solid ${GOLD}aa`,
            borderRadius: 3, padding: "10px 22px",
            cursor: "pointer", transition: "all .2s", flexShrink: 0,
          }}
        >
          LAUNCH PLATFORM →
        </motion.button>
      </nav>

      {/* ═══════════════════════════════════════
          HERO SECTION
      ═══════════════════════════════════════ */}
      <section style={{
        position: "relative",
        height: "100vh",
        overflow: "hidden",
        paddingTop: 76,
        minHeight: 720,
        display: "flex",
        flexDirection: "column",
      }}>
        {/* 3D scene background */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <Suspense fallback={
            <div style={{ width: "100%", height: "100%", background: `radial-gradient(ellipse 70% 60% at 52% 68%, rgba(245,180,0,0.07) 0%, rgba(35,24,0,0.4) 40%, transparent 70%)` }} />
          }>
            <LandingHeroScene />
          </Suspense>
        </div>

        {/* Atmospheric layering */}
        <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: `radial-gradient(ellipse 85% 45% at 50% 100%, rgba(55,35,0,0.32) 0%, transparent 58%)` }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "42%", zIndex: 1, pointerEvents: "none", background: "linear-gradient(180deg, rgba(3,5,5,0.72) 0%, transparent 100%)" }} />

        {/* Blueprint grid */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
          backgroundImage: `linear-gradient(rgba(245,180,0,0.016) 1px,transparent 1px), linear-gradient(90deg,rgba(245,180,0,0.016) 1px,transparent 1px)`,
          backgroundSize: "60px 60px",
        }} />

        {/* Floating particles */}
        <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none", overflow: "hidden" }}>
          {[
            [8, 18, 2.2, 5, 0], [19, 71, 1.5, 4.5, .9], [33, 37, 2.5, 6, 1.7], [46, 84, 2, 5, .3],
            [59, 21, 1.5, 4.2, 2.2], [71, 57, 2.5, 5.8, 1.2], [83, 40, 1.5, 4.8, .5], [92, 76, 2, 5.2, 2],
            [26, 91, 2.5, 6.5, .1], [66, 7, 2, 4.6, 1.5], [51, 51, 2.2, 5.4, 1], [13, 47, 1.5, 4.4, 2.5],
            [77, 29, 2, 5.6, .2], [39, 67, 2.5, 5, 1.8], [88, 14, 1.5, 4.3, .8],
          ].map(([l, t, sz, d, delay], i) => (
            <div key={i} style={{
              position: "absolute", left: `${l}%`, top: `${t}%`,
              width: `${sz}px`, height: `${sz}px`, borderRadius: "50%",
              background: i % 4 === 0 ? GOLD : i % 4 === 1 ? `${GOLD}88` : i % 4 === 2 ? "rgba(255,255,255,0.65)" : "rgba(0,200,255,0.55)",
              boxShadow: `0 0 ${(sz as number) * 2.5 + 3}px rgba(245,180,0,0.9)`,
              animation: `particle ${d}s ease-in-out infinite`,
              animationDelay: `${delay}s`,
            }} />
          ))}
        </div>

        {/* Dark vignette */}
        <div style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", background: `radial-gradient(ellipse 46% 74% at 50% 56%, transparent 0%, rgba(3,5,5,0.08) 42%, rgba(3,5,5,0.55) 100%)` }} />
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "42%", zIndex: 3, pointerEvents: "none", background: "linear-gradient(to right, rgba(3,5,5,0.99) 0%, rgba(3,5,5,0.9) 52%, transparent 100%)" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "24%", zIndex: 3, pointerEvents: "none", background: "linear-gradient(to left, rgba(3,5,5,0.99) 0%, rgba(3,5,5,0.88) 52%, transparent 100%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "22%", zIndex: 3, pointerEvents: "none", background: "linear-gradient(to top, rgba(3,5,5,1) 0%, transparent 100%)" }} />

        {/* ── CONTENT LAYER ── */}
        <div style={{
          position: "relative", zIndex: 20, flex: 1, minHeight: 0,
          display: "flex", alignItems: "stretch", padding: "0 28px",
        }}>

          {/* ── LEFT: Copy ── */}
          <div style={{
            width: "37%", display: "flex", flexDirection: "column",
            justifyContent: "center", paddingBottom: 0, paddingRight: 20,
          }}>
            {/* Eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 18, height: "1.5px", background: GOLD }} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "1.16rem", color: GOLD, letterSpacing: "0.2em", textTransform: "uppercase" }}>Mining Intelligence Platform</span>
            </div>

            {/* ADIOS title */}
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10, lineHeight: 0.88 }}>
              {"ADIOS".split("").map((ch, i) => (
                <span key={i} className="gl" style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontWeight: 900,
                  fontSize: "clamp(3.4rem,7vw,6.2rem)",
                  letterSpacing: "0.06em",
                  color: ch === "O" || ch === "S" ? GOLD : "#ffffff",
                  textShadow: ch === "O" || ch === "S"
                    ? `0 0 52px ${GOLD}99, 0 0 104px ${GOLD}33`
                    : "0 2px 16px rgba(0,0,0,0.8)",
                  display: "inline-block",
                  background: ch !== "O" && ch !== "S"
                    ? "linear-gradient(180deg, #ffffff 0%, #cccccc 100%)"
                    : "none",
                  WebkitBackgroundClip: ch !== "O" && ch !== "S" ? "text" : "unset",
                  WebkitTextFillColor: ch !== "O" && ch !== "S" ? "transparent" : "unset",
                }}>{ch}</span>
              ))}
            </div>

            {/* Subtitle */}
            <div className="gs" style={{
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: "clamp(.86rem, 1.5vw, 1.12rem)",
              letterSpacing: ".12em",
              color: "#ffffff",
              lineHeight: 1.5,
              marginBottom: 12,
              textTransform: "uppercase",
            }}>
              Adaptive Dump Intelligence &<br />Orchestration System
            </div>

            {/* Gold rule */}
            <div style={{ width: 48, height: 2, background: `linear-gradient(90deg, ${GOLD}, transparent)`, marginBottom: 14, borderRadius: 1 }} />

            {/* Description */}
            <p className="gd" style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "1.08rem",
              color: "#b8c0cc",
              lineHeight: 1.7,
              marginBottom: 26,
              maxWidth: 400,
            }}>
              Real-time adaptive intelligence for autonomous mining logistics.
              Optimizing every dump. Every load. Every decision.
            </p>

            {/* CTA Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 290 }}>
              <motion.button
                className="gb"
                onClick={() => router.push("/dashboard")}
                whileHover={{ boxShadow: `0 0 36px ${GOLD}aa, 0 0 72px ${GOLD}44` }}
                whileTap={{ scale: .97 }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "13px 22px",
                  background: GOLD, border: "none", borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: "'Orbitron', sans-serif", fontWeight: 700,
                  fontSize: "1.11rem", letterSpacing: ".18em", textTransform: "uppercase",
                  color: "#000",
                  boxShadow: `0 0 18px ${GOLD}55`,
                  transition: "box-shadow .2s",
                }}
              >
                LAUNCH PLATFORM <span style={{ fontSize: "1.05rem" }}>↗</span>
              </motion.button>

              <motion.button
                className="gb"
                onClick={() => router.push("/dashboard")}
                whileHover={{ borderColor: GOLD, color: GOLD }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "11px 22px",
                  background: "transparent", border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 3, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                  fontSize: "1.08rem", letterSpacing: ".13em", textTransform: "uppercase",
                  color: "#e5e5e5", transition: "all .2s",
                }}
              >
                VIEW SIMULATION <span>→</span>
              </motion.button>

              <motion.button
                className="gb"
                onClick={() => router.push("/intelligence")}
                whileHover={{ borderColor: GOLD, color: GOLD }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "11px 22px",
                  background: "transparent", border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 3, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                  fontSize: "1.08rem", letterSpacing: ".13em", textTransform: "uppercase",
                  color: "#9ca3af", transition: "all .2s",
                }}
              >
                EXPLORE ENGINE <span>→</span>
              </motion.button>
            </div>
          </div>

          {/* ── CENTER: Visual overlays ── */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

            {/* Terrain scan — top center */}
            <div className="ghud" style={{
              position: "absolute", top: "4%", left: "50%",
              transform: "translateX(-50%)", pointerEvents: "none", zIndex: 5,
            }}>
              <TerrainHolo />
            </div>

            {/* Main CAT truck */}
            <div style={{
              position: "absolute", bottom: "3%", left: "50%",
              transform: "translateX(-50%)", pointerEvents: "none", zIndex: 5,
            }}>
              {/* Scan rings */}
              {[168, 122, 84].map((sz, i) => (
                <div key={i} style={{
                  position: "absolute", top: "50%", left: "50%",
                  width: sz, height: sz, borderRadius: "50%",
                  border: `1px solid ${GOLD}${["2a", "48", "88"][i]}`,
                  animation: `ring-pulse ${3.2 + i * .4}s ease-in-out infinite ${i * .38}s`,
                  boxShadow: i === 2 ? `0 0 10px ${GOLD}33` : "none",
                }} />
              ))}
              {/* Spinning dashes */}
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                width: 182, height: 182, borderRadius: "50%",
                border: `1px dashed ${GOLD}30`,
                animation: "spin-ring 14s linear infinite",
              }} />
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                width: 138, height: 138, borderRadius: "50%",
                border: `1px dashed ${GOLD}22`,
                animation: "spin-ring-r 20s linear infinite",
              }} />
              {/* Truck — scaled down so it doesn't overshadow panel content */}
              <CatTruck scale={0.62} />
              {/* Ground glow */}
              <div style={{
                position: "absolute", bottom: -6, left: "12%", right: "12%", height: 16,
                background: `radial-gradient(ellipse 80% 100% at 50% 50%, ${GOLD}14, transparent)`,
                borderRadius: "50%", filter: "blur(5px)",
              }} />
            </div>

            {/* Truck status trackers */}
            <div className="ghud" style={{
              position: "absolute", top: "36%", left: "3%",
              display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
            }}>
              {[
                { id: "CAT-793", color: GOLD, status: "DUMPING" },
                { id: "CAT-777", color: "#00D4FF", status: "EN ROUTE" },
                { id: "CAT-797", color: "#FF6B35", status: "STANDBY" },
              ].map(({ id, color, status }, idx) => (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ position: "relative", width: 12, height: 12, flexShrink: 0 }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} />
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${color}`, background: "transparent", animation: "truck-ping 2.4s ease-out infinite", animationDelay: `${idx * .78}s` }} />
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.81rem", color, fontWeight: 600, letterSpacing: ".08em" }}>{id}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.76rem", color: status === "DUMPING" ? "#4ade80" : status === "EN ROUTE" ? "#00D4FF" : "#6b7280", letterSpacing: ".04em" }}>{status}</span>
                </div>
              ))}
            </div>

            {/* Route optimized card — upper right of center */}
            <div className="ghud" style={{
              position: "absolute", top: "32%", right: "4%",
              padding: "10px 14px",
              background: "rgba(4,6,8,0.92)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4, backdropFilter: "blur(16px)",
              pointerEvents: "none",
              animation: "float-up 4.6s ease-in-out infinite",
              boxShadow: "0 6px 28px rgba(0,0,0,0.6)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD, boxShadow: `0 0 7px ${GOLD}` }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.72rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".1em" }}>Route Optimized</span>
              </div>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "1.08rem", color: "#fff", fontWeight: 700, marginBottom: 10 }}>ETA 02:45 MIN</div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 8 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 7px #4ade80" }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.72rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".1em" }}>Fuel Optimized</span>
              </div>
              <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "1.08rem", color: "#4ade80", fontWeight: 700 }}>+18% EFFICIENCY</div>
            </div>

            {/* PPO active badge */}
            <div className="ghud" style={{
              position: "absolute", top: "22%", left: "3%",
              padding: "5px 12px",
              background: "rgba(3,5,5,0.9)",
              border: "1px solid rgba(74,222,128,0.24)",
              borderRadius: 3, backdropFilter: "blur(12px)",
              pointerEvents: "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 7px #4ade80", animation: "blink 1.9s ease-in-out infinite" }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.78rem", color: "#4ade80", letterSpacing: ".12em", textTransform: "uppercase" }}>PPO Policy Active</span>
              </div>
            </div>

            {/* Road arrows (SVG overlay) */}
            <div style={{ position: "absolute", bottom: "8%", left: "15%", right: "15%", pointerEvents: "none", zIndex: 4 }}>
              <svg width="100%" height="60" viewBox="0 0 400 60" fill="none" style={{ opacity: 0.55 }}>
                <path d="M 50,50 Q 100,20 160,50 Q 200,70 240,45 Q 300,20 360,50"
                  stroke={GOLD} strokeWidth="1.2" fill="none" strokeDasharray="6 5"
                  style={{ animation: "dash-arrow 2s linear infinite" }} />
                {[100, 200, 300].map(x => (
                  <g key={x} transform={`translate(${x}, 38)`}>
                    <polygon points="0,-5 6,0 0,5" fill={GOLD} opacity="0.75" style={{ animation: `road-glow 2.5s ease-in-out infinite ${x * .005}s` }} />
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* ── RIGHT: Live metrics panel ── */}
          <div style={{
            width: "22%", display: "flex", flexDirection: "column",
            justifyContent: "center", alignSelf: "stretch", paddingTop: 8, paddingBottom: 8,
          }}>
            <div style={{
              background: "rgba(8,9,9,0.92)",
              border: `1px solid rgba(245,180,0,0.2)`,
              borderRadius: 6,
              overflow: "hidden",
              backdropFilter: "blur(20px)",
              boxShadow: `0 0 44px rgba(0,0,0,0.75), inset 0 0 1px ${GOLD}18`,
              position: "relative",
              height: "100%",
              display: "flex", flexDirection: "column",
            }}>
              {/* Panel header */}
              <div style={{
                padding: "7px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: 8,
                background: `rgba(245,180,0,0.04)`,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD, animation: "blink 2.1s ease-in-out infinite", boxShadow: `0 0 8px ${GOLD}` }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.78rem", color: "#fff", letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 700 }}>▶ Live System Metrics</span>
              </div>

              {/* Metric rows — flex: 1 so they evenly fill available height */}
              {METRICS.map((m, mi) => (
                <div
                  key={m.label}
                  className="gm"
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "0 11px",
                    flex: 1,
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    transition: "background .15s",
                    cursor: "default",
                    minHeight: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = `rgba(245,180,0,0.03)`}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                >
                  {/* Icon box */}
                  <div style={{
                    width: 24, height: 24, borderRadius: 3,
                    background: `rgba(245,180,0,0.07)`,
                    border: `1px solid rgba(245,180,0,0.2)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.97rem", color: GOLD, flexShrink: 0,
                  }}>{m.icon}</div>

                  {/* Label + value */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono',monospace", fontSize: "0.62rem",
                      color: "#6b7280", textTransform: "uppercase", letterSpacing: ".07em",
                      marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{m.label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "1.11rem", fontWeight: 700, color: "#fff" }}>
                        <CountUp to={m.to} suffix={m.suffix} decimals={(m as any).decimals ?? 0} delay={mi * 0.12} />
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.62rem", color: m.pos ? "#4ade80" : "#f87171" }}>{m.delta}</span>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <Spark d={m.d} color={m.pos ? (m.t === "bar" ? "#4ade80" : GOLD) : "#f87171"} type={m.t} />
                </div>
              ))}

              {/* Status footer */}
              <div style={{
                padding: "6px 12px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(74,222,128,0.025)",
              }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.73rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".1em" }}>System Status</span>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80", animation: "blink 2s ease-in-out infinite" }} />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.84rem", color: "#4ade80", fontWeight: 700, letterSpacing: ".1em" }}>OPERATIONAL</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* ═══════════════════════════════════════
          SECTION — HOW ADIOS THINKS (process steps)
      ═══════════════════════════════════════ */}
      <section style={{ position: "relative", padding: "84px 28px", background: "#040606" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 44 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.78rem", color: GOLD, letterSpacing: ".28em", textTransform: "uppercase" }}>The Decision Loop</span>
              <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: "clamp(1.7rem,3.6vw,2.7rem)", letterSpacing: ".06em", color: "#fff", textTransform: "uppercase", margin: "10px 0 0" }}>
                How ADIOS Thinks
              </h2>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1.19rem", color: "#9ca3af", maxWidth: 520, margin: "12px auto 0", lineHeight: 1.6 }}>
                Five stages, looping continuously — from raw terrain data to a dispatched truck and back again.
              </p>
            </div>
          </Reveal>

          <div style={{ display: "flex", alignItems: "stretch", gap: 0, flexWrap: "wrap" }}>
            {STEPS.map((step, i) => (
              <React.Fragment key={step.n}>
                <Reveal delay={i * 0.08}>
                  <div
                    className="sc"
                    style={{
                      width: 190,
                      display: "flex", flexDirection: "column",
                      padding: "20px 16px 22px",
                      background: "rgba(7,9,9,0.82)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 6,
                      position: "relative",
                      cursor: "default",
                      gap: 8,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 0, left: "15%", right: "15%", height: "1.5px",
                      background: `linear-gradient(90deg, transparent, ${GOLD}99, transparent)`,
                    }} />
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.78rem", color: "#3d4855", letterSpacing: ".12em" }}>{step.n}</div>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <PIcon type={step.type} />
                    </div>
                    <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 700, fontSize: "0.92rem", letterSpacing: ".18em", color: GOLD, textTransform: "uppercase", textAlign: "center" }}>{step.label}</div>
                    <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1.08rem", color: "#9ca3af", lineHeight: 1.55, textAlign: "center", margin: 0 }}>{step.desc}</p>
                  </div>
                </Reveal>

                {i < STEPS.length - 1 && (
                  <div style={{ width: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
                    <div style={{ width: "100%", height: 1, background: `linear-gradient(90deg, ${GOLD}33, ${GOLD}88, ${GOLD}33)`, position: "relative" }}>
                      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 5, height: 5, borderRadius: "50%", background: GOLD, boxShadow: `0 0 6px ${GOLD}`, animation: "blink 2.2s ease-in-out infinite" }} />
                      <div style={{ position: "absolute", right: -1, top: "50%", transform: "translateY(-50%)", width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: `7px solid ${GOLD}99` }} />
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION — LIVE SYSTEM METRICS (full detail grid)
      ═══════════════════════════════════════ */}
      <section style={{ position: "relative", padding: "84px 28px", background: "#030505", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 44 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.78rem", color: GOLD, letterSpacing: ".28em", textTransform: "uppercase" }}>Measured, Not Marketed</span>
              <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: "clamp(1.7rem,3.6vw,2.7rem)", letterSpacing: ".06em", color: "#fff", textTransform: "uppercase", margin: "10px 0 0" }}>
                Live System Metrics
              </h2>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1.19rem", color: "#9ca3af", maxWidth: 540, margin: "12px auto 0", lineHeight: 1.6 }}>
                Pulled from the same simulation engine running on the dashboard — every figure here is reproducible, not illustrative.
              </p>
            </div>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {METRICS.map((m, mi) => (
              <Reveal key={m.label} delay={(mi % 3) * 0.08}>
                <div className="feat-card" style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "18px 20px",
                  background: "rgba(8,9,9,0.78)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 6,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 5,
                    background: `rgba(245,180,0,0.07)`,
                    border: `1px solid rgba(245,180,0,0.2)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1rem", color: GOLD, flexShrink: 0,
                  }}>{m.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.65rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 3 }}>{m.label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "1.18rem", fontWeight: 700, color: "#fff" }}>
                        <CountUp to={m.to} suffix={m.suffix} decimals={(m as any).decimals ?? 0} delay={mi * 0.06} />
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.68rem", color: m.pos ? "#4ade80" : "#f87171" }}>{m.delta}</span>
                    </div>
                  </div>
                  <Spark d={m.d} color={m.pos ? (m.t === "bar" ? "#4ade80" : GOLD) : "#f87171"} type={m.t} />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          SECTION — BUILT FOR THE FUTURE OF MINING
      ═══════════════════════════════════════ */}
      <section style={{ position: "relative", padding: "84px 28px", background: "#040606", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 44 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.78rem", color: GOLD, letterSpacing: ".28em", textTransform: "uppercase" }}>Why ADIOS</span>
              <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: "clamp(1.7rem,3.6vw,2.7rem)", letterSpacing: ".06em", color: "#fff", textTransform: "uppercase", margin: "10px 0 0" }}>
                Built for the Future of Mining
              </h2>
            </div>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
            {FEATURES.map(({ icon, title, desc }, fi) => (
              <Reveal key={title} delay={fi * 0.09}>
                <div className="feat-card" style={{
                  padding: "26px 22px",
                  background: "rgba(7,9,9,0.78)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 8,
                  height: "100%",
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 6,
                    border: `1px solid rgba(245,180,0,0.24)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.2rem", color: GOLD, marginBottom: 16,
                    background: `rgba(245,180,0,0.05)`,
                  }}>{icon}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.86rem", fontWeight: 700, color: "#fff", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1.16rem", color: "#9ca3af", lineHeight: 1.6 }}>{desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════ */}
      <footer style={{
        background: "#020304",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        position: "relative",
      }}>
        {/* Top gold line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${GOLD}55 22%, ${GOLD}88 50%, ${GOLD}55 78%, transparent 100%)`,
        }} />

        <div style={{
          maxWidth: 1180, margin: "0 auto", padding: "56px 28px 28px",
          display: "flex", flexWrap: "wrap", gap: 48, justifyContent: "space-between",
        }}>
          {/* Brand column */}
          <div style={{ maxWidth: 300 }}>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
              {"ADIOS".split("").map((ch, i) => (
                <span key={i} style={{
                  fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: "1.3rem",
                  letterSpacing: "0.1em",
                  color: ch === "O" || ch === "S" ? GOLD : "#ffffff",
                }}>{ch}</span>
              ))}
            </div>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1.11rem", color: "#6b7280", lineHeight: 1.7, margin: 0 }}>
              Adaptive Dump Intelligence &amp; Orchestration System — real-time
              decision intelligence for autonomous mining logistics.
            </p>
          </div>

          {/* Navigate column */}
          <div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.68rem", color: GOLD, letterSpacing: ".22em", textTransform: "uppercase", marginBottom: 16 }}>Navigate</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {NAV_LINKS.map(link => (
                <button
                  key={link}
                  className="nl"
                  onClick={() => router.push(NAV_ROUTES[link])}
                  style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: "1.11rem",
                    color: "#9ca3af", background: "transparent", border: "none",
                    cursor: "pointer", padding: 0, textAlign: "left",
                  }}
                >
                  {link.charAt(0) + link.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Built for column */}
          <div style={{ maxWidth: 360 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.68rem", color: GOLD, letterSpacing: ".22em", textTransform: "uppercase", marginBottom: 16 }}>Built For The Future Of Mining</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {FEATURES.map(({ icon, title, desc }) => (
                <div key={title} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 3,
                    border: `1px solid rgba(245,180,0,0.24)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.0rem", color: GOLD, flexShrink: 0,
                    background: `rgba(245,180,0,0.05)`,
                  }}>{icon}</div>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.68rem", fontWeight: 700, color: "#fff", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 2 }}>{title}</div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "1.0rem", color: "#6b7280", lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CAT brand block */}
          <div style={{
            background: GOLD,
            padding: "16px 26px",
            borderRadius: 4,
            flexShrink: 0,
            alignSelf: "flex-start",
            boxShadow: `0 0 32px ${GOLD}55`,
          }}>
            <div style={{ fontFamily: "'Orbitron',sans-serif", fontWeight: 900, fontSize: "1rem", letterSpacing: ".13em", color: "#000", textTransform: "uppercase" }}>CATERPILLAR</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.62rem", color: "#000", opacity: .5, textAlign: "center", marginTop: 2, letterSpacing: ".1em" }}>® INSPIRED</div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          maxWidth: 1180, margin: "0 auto",
          padding: "18px 28px 28px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          display: "flex", flexWrap: "wrap", gap: 12,
          alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.78rem", color: "#4b5563", letterSpacing: ".08em" }}>
            © {new Date().getFullYear()} ADIOS — Adaptive Dump Intelligence &amp; Orchestration System
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80", animation: "blink 2.4s ease-in-out infinite" }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.76rem", color: "#4ade80", letterSpacing: ".1em", textTransform: "uppercase" }}>All Systems Operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
