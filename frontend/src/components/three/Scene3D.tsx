"use client";
import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TerrainMeshProps {
  surface: number[][];
  mask: boolean[][];
  heightScale?: number;
  showWireframe?: boolean;
}

interface HoverInfo {
  r: number;
  c: number;
  heightM: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  nearestCellDistM: number | null;
  nearestPileDistM: number | null;
  pileClusterId: number | null;
}

// Cells whose height exceeds this are considered "deposited material" for the
// raw nearest-cell search. Mirrors backend SITE_CONFIG.pile_detection_threshold_m
// (config.py param 14) — this is the same threshold the live simulation and the
// trained PPO policy's terrain-map observation channels use, so changing it here
// without changing it server-side would desync the displayed reading from the
// model's view of the world.
const PILE_HEIGHT_THRESHOLD_M = 0.2;

export interface PileCluster {
  id: number;
  cells: number; // cell count (≈ m², since 1 cell = 1 m²)
  centroidR: number;
  centroidC: number;
  peakHeightM: number;
}

/**
 * Connected-component labelling (4-connected flood fill) over cells exceeding
 * the pile-detection threshold. Distinguishes a single contiguous mound from a
 * neighbouring, separately-formed one — the raw per-cell distance used by
 * `nearestCellDistM` collapses both into "the same nearby material" and tends
 * to read ~1 cell for any point near an active dump (adjacent cells of the SAME
 * mound clear the threshold immediately). Cluster identity answers a different,
 * more useful question: "how far is the nearest *distinct* pile?"
 */
function labelPileClusters(surface: number[][], mask: boolean[][]): { labels: Int32Array; clusters: PileCluster[] } {
  const ROWS = surface.length;
  const COLS = surface[0].length;
  const labels = new Int32Array(ROWS * COLS).fill(-1);
  const clusters: PileCluster[] = [];
  const idx = (r: number, c: number) => r * COLS + c;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (labels[idx(r, c)] !== -1) continue;
      if (!mask[r][c] || surface[r][c] <= PILE_HEIGHT_THRESHOLD_M) continue;

      const id = clusters.length;
      const queue: [number, number][] = [[r, c]];
      labels[idx(r, c)] = id;
      let cells = 0, sumR = 0, sumC = 0, peak = 0;

      while (queue.length) {
        const [cr, cc] = queue.pop()!;
        cells++; sumR += cr; sumC += cc;
        if (surface[cr][cc] > peak) peak = surface[cr][cc];
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          if (labels[idx(nr, nc)] !== -1) continue;
          if (!mask[nr][nc] || surface[nr][nc] <= PILE_HEIGHT_THRESHOLD_M) continue;
          labels[idx(nr, nc)] = id;
          queue.push([nr, nc]);
        }
      }
      clusters.push({ id, cells, centroidR: sumR / cells, centroidC: sumC / cells, peakHeightM: peak });
    }
  }
  return { labels, clusters };
}

// Find the closest cell (by Euclidean grid distance, in metres since 1 cell = 1m)
// whose height clears the pile-detection threshold and isn't the hovered cell itself.
// This is the fine-grained "nearest deposited material" reading — for piles that
// have merged or sit edge-to-edge, it is often ~1 cell (the immediate neighbour
// of the same mound). Pair with `nearestDistinctPile` for a meaningful spacing read.
function nearestCellDistanceM(surface: number[][], mask: boolean[][], r: number, c: number): number | null {
  const ROWS = surface.length;
  const COLS = surface[0].length;
  let best = Infinity;
  for (let rr = 0; rr < ROWS; rr++) {
    for (let cc = 0; cc < COLS; cc++) {
      if (rr === r && cc === c) continue;
      if (!mask[rr][cc]) continue;
      if (surface[rr][cc] <= PILE_HEIGHT_THRESHOLD_M) continue;
      const d = Math.hypot(rr - r, cc - c);
      if (d < best) best = d;
    }
  }
  return Number.isFinite(best) ? best : null;
}

// Distance (in cells/metres) from (r, c) to the centroid of the nearest *distinct*
// pile cluster — i.e. excluding whichever cluster (r, c) itself belongs to. This
// is the analytically meaningful "pile spacing" reading: it answers "how far is
// the next separate mound", not "how far is the next deposited cell of this one".
function nearestDistinctPileDistanceM(
  labels: Int32Array, clusters: PileCluster[], cols: number, r: number, c: number
): { distM: number | null; clusterId: number | null } {
  const ownId = labels[r * cols + c];
  let best = Infinity;
  let bestId: number | null = null;
  for (const cluster of clusters) {
    if (cluster.id === ownId) continue;
    const d = Math.hypot(cluster.centroidR - r, cluster.centroidC - c);
    if (d < best) { best = d; bestId = cluster.id; }
  }
  return { distM: Number.isFinite(best) ? best : null, clusterId: bestId };
}

interface DumpMarkerProps {
  r: number;
  c: number;
  rows: number;
  cols: number;
}

interface EntryMarkerProps {
  entry: [number, number];
  rows: number;
  cols: number;
}

export interface Scene3DProps {
  surface: number[][] | null;
  mask: boolean[][] | null;
  entry?: [number, number] | null;
  dumpMarkers?: Array<{ r: number; c: number }>;
  heightScale?: number;
  showWireframe?: boolean;
  camPreset?: "iso" | "top" | "front" | "orbit";
}

// ── Height → vivid colour ramp ────────────────────────────────────────────────
// 6-stop gradient designed to POP against dark background:
//   Deep Teal → Electric Cyan → Neon Green → Caterpillar Yellow → Hot Orange → White peak
function heightToRGB(t: number): [number, number, number] {
  if (t < 0.12) {
    // Very low → deep teal glow
    const f = t / 0.12;
    return [0.0, 0.35 + f * 0.4, 0.5 + f * 0.3];
  }
  if (t < 0.30) {
    // Low → electric cyan to bright teal-blue
    const f = (t - 0.12) / 0.18;
    return [0.0, 0.75 + f * 0.15, 0.8 - f * 0.15];
  }
  if (t < 0.50) {
    // Mid-low → transition to vivid neon green
    const f = (t - 0.30) / 0.20;
    return [0.15 * f, 0.9 - f * 0.05, 0.65 - f * 0.5];
  }
  if (t < 0.65) {
    // Mid → neon chartreuse into bright yellow-green
    const f = (t - 0.50) / 0.15;
    return [0.15 + f * 0.65, 0.85 + f * 0.15, 0.15 - f * 0.15];
  }
  if (t < 0.80) {
    // Mid-high → Caterpillar Yellow
    const f = (t - 0.65) / 0.15;
    return [0.8 + f * 0.2, 1.0 - f * 0.22, 0.0];
  }
  if (t < 0.92) {
    // High → hot orange
    const f = (t - 0.80) / 0.12;
    return [1.0, 0.78 - f * 0.48, 0.0];
  }
  // Peak → near-white hot
  const f = (t - 0.92) / 0.08;
  return [1.0, 0.3 + f * 0.7, 0.1 + f * 0.9];
}

// ── Terrain mesh (MASK-ONLY vertices — no out-of-mask geometry at all) ────────
// Root cause fix: Only emit vertices for cells INSIDE the mask.
// Uses an index remap so no stray vertices exist at y=-999 or y=-0.1.
function TerrainMesh({ surface, mask, heightScale = 1.8, showWireframe = false }: TerrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ROWS = surface.length;
  const COLS = surface[0].length;
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // Recompute pile clusters only when the surface actually changes (not per-hover) —
  // the flood-fill is O(rows×cols) and would otherwise re-run on every mousemove.
  const { labels: pileLabels, clusters: pileClusters } = useMemo(
    () => labelPileClusters(surface, mask),
    [surface, mask]
  );

  const { geometry, material } = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // Step 1: Find max height inside mask for normalisation
    let maxH = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (mask[r][c] && surface[r][c] > maxH) maxH = surface[r][c];
    const hRange = Math.max(maxH, 0.01);

    // Step 2: Create vertex index remap — only mask cells get vertices
    const remap = new Int32Array(ROWS * COLS).fill(-1);
    let vertIdx = 0;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!mask[r][c]) continue;

        const h = surface[r][c];
        const y = h * heightScale;
        positions.push(c - COLS / 2, y, r - ROWS / 2);

        if (h <= 0.001) {
          // Polygon floor — subtle dark cyan-blue glow
          colors.push(0.03, 0.14, 0.22);
        } else {
          const t = Math.min(1, h / hRange);
          const [rr, gg, bb] = heightToRGB(t);
          colors.push(rr, gg, bb);
        }

        remap[r * COLS + c] = vertIdx;
        vertIdx++;
      }
    }

    // Step 3: Emit faces only where ALL 4 quad corners are inside mask
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const i00 = remap[r * COLS + c];
        const i10 = remap[(r + 1) * COLS + c];
        const i01 = remap[r * COLS + (c + 1)];
        const i11 = remap[(r + 1) * COLS + (c + 1)];

        // Strict: ALL 4 must be in mask
        if (i00 < 0 || i10 < 0 || i01 < 0 || i11 < 0) continue;

        indices.push(i00, i10, i01);
        indices.push(i01, i10, i11);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.15,
      side: THREE.FrontSide,
      wireframe: showWireframe,
      flatShading: false,
    });

    return { geometry: geo, material: mat };
  }, [surface, mask, heightScale, showWireframe, ROWS, COLS]);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  // World-space (x,z) → grid (row,col): inverse of the `c - COLS/2, r - ROWS/2` placement above.
  const handlePointerMove = (e: any) => {
    e.stopPropagation();
    const p = e.point as THREE.Vector3;
    const c = Math.round(p.x + COLS / 2);
    const r = Math.round(p.z + ROWS / 2);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || !mask[r][c]) {
      setHover(null);
      return;
    }
    const heightM = surface[r][c];
    const distinctPile = nearestDistinctPileDistanceM(pileLabels, pileClusters, COLS, r, c);
    setHover({
      r, c, heightM,
      worldX: p.x, worldY: heightM * heightScale, worldZ: p.z,
      nearestCellDistM: nearestCellDistanceM(surface, mask, r, c),
      nearestPileDistM: distinctPile.distM,
      pileClusterId: distinctPile.clusterId,
    });
  };

  const handlePointerOut = () => setHover(null);

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      />
      {hover && (
        <Html
          position={[hover.worldX, hover.worldY + 2.5, hover.worldZ]}
          distanceFactor={50}
          style={{ pointerEvents: "none" }}
        >
          <div style={{
            background: "rgba(5,5,10,0.92)",
            border: "1px solid #4FD1C5",
            color: "#4FD1C5",
            padding: "6px 10px",
            borderRadius: 3,
            fontFamily: "JetBrains Mono",
            fontSize: "0.62rem",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            lineHeight: 1.5,
          }}>
            <div>CELL [{hover.r}, {hover.c}]</div>
            <div>HEIGHT&nbsp;&nbsp;{hover.heightM.toFixed(2)} m</div>
            <div>
              NEAREST CELL&nbsp;&nbsp;
              {hover.nearestCellDistM != null ? `${hover.nearestCellDistM.toFixed(1)} m` : "none"}
            </div>
            <div>
              NEAREST PILE&nbsp;&nbsp;
              {hover.nearestPileDistM != null
                ? `${hover.nearestPileDistM.toFixed(1)} m (#${hover.pileClusterId})`
                : "none"}
            </div>
          </div>
        </Html>
      )}
    </>
  );
}

// ── Dump flash marker ─────────────────────────────────────────────────────────
function DumpMarker({ r, c, rows, cols }: DumpMarkerProps) {
  const ref = useRef<THREE.Mesh>(null);
  const [opacity, setOpacity] = useState(1.0);

  useFrame(() => {
    if (opacity > 0) setOpacity((o) => Math.max(0, o - 0.02));
  });

  if (opacity <= 0) return null;

  return (
    <mesh ref={ref} position={[c - cols / 2, 8 + (1 - opacity) * 6, r - rows / 2]}>
      <sphereGeometry args={[1.8, 12, 12]} />
      <meshBasicMaterial color="#FFC000" transparent opacity={opacity * 0.85} />
    </mesh>
  );
}

// ── Entry point marker ────────────────────────────────────────────────────────
function EntryMarker({ entry, rows, cols }: EntryMarkerProps) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.8;
  });

  const [er, ec] = entry;
  return (
    <group ref={ref} position={[ec - cols / 2, 6, er - rows / 2]}>
      <mesh>
        <coneGeometry args={[2.0, 6, 6]} />
        <meshBasicMaterial color="#FF5722" transparent opacity={0.88} />
      </mesh>
      <Html position={[0, 8, 0]} distanceFactor={60} style={{ pointerEvents: "none" }}>
        <div style={{
          background: "rgba(5,5,10,0.92)",
          border: "1px solid #FF5722",
          color: "#FF5722",
          padding: "5px 12px",
          borderRadius: 3,
          fontFamily: "JetBrains Mono",
          fontSize: "0.68rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          textAlign: "center",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}>
          Haul Road Entry<br />
          <span style={{ fontSize: "0.56rem", color: "rgba(255,120,80,0.6)" }}>
            truck drop-off
          </span>
        </div>
      </Html>
    </group>
  );
}

// ── Camera preset controller ──────────────────────────────────────────────────
function CameraController({ preset }: { preset: string }) {
  const { camera } = useThree();
  const startPos = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());
  const progress = useRef(0);

  useEffect(() => {
    if (preset === "iso")   endPos.current.set(75, 55, 75);
    else if (preset === "top")   endPos.current.set(0, 140, 0.1);
    else if (preset === "front") endPos.current.set(0, 25, 130);
    startPos.current.copy(camera.position);
    progress.current = 0;
  }, [preset, camera.position]);

  useFrame(() => {
    if (progress.current < 1) {
      progress.current += 0.06;
      const t = Math.min(progress.current, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos.current, endPos.current, eased);
      // Aim slightly below the terrain's center so the mesh renders higher
      // in the viewport frame, leaving breathing room below for the legend/UI.
      camera.lookAt(0, -10, 0);
    }
  });

  return null;
}

// ── Scene lighting ────────────────────────────────────────────────────────────
function SceneLights() {
  return (
    <>
      {/* Warm neutral ambient — enough to see floor but not wash out */}
      <ambientLight intensity={0.55} color="#F0F0F0" />

      {/* Key: upper-front white light for full vertex colour fidelity */}
      <directionalLight
        position={[60, 100, 50]}
        intensity={2.0}
        color="#FFFFFF"
      />

      {/* Fill: soft warm from left-back */}
      <directionalLight position={[-70, 50, -50]} intensity={0.5} color="#FFE8A0" />

      {/* Rim: subtle cool cyan from below-behind for edge definition */}
      <directionalLight position={[0, -10, -90]} intensity={0.25} color="#60D0FF" />

      {/* Top down-light for even ground illumination */}
      <pointLight position={[0, 100, 0]} intensity={0.4} color="#FFFFFF" />
    </>
  );
}

// ── Main exported Scene3D ─────────────────────────────────────────────────────
export default function Scene3D({
  surface,
  mask,
  entry,
  dumpMarkers = [],
  heightScale = 1.8,
  showWireframe = false,
  camPreset = "iso",
}: Scene3DProps) {
  const ROWS = surface?.length ?? 100;
  const COLS = surface?.[0]?.length ?? 100;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Scale legend — clarifies that vertical exaggeration is for visibility only */}
      <div style={{
        position: "absolute",
        bottom: 14,
        left: 14,
        zIndex: 5,
        background: "rgba(5,5,10,0.78)",
        border: "1px solid rgba(79,209,197,0.4)",
        borderRadius: 4,
        padding: "9px 13px",
        fontFamily: "JetBrains Mono",
        fontSize: "0.72rem",
        color: "#4FD1C5",
        letterSpacing: "0.03em",
        lineHeight: 1.65,
        pointerEvents: "none",
      }}>
        <div>1 GRID CELL = 1 m</div>
        <div>VERTICAL SCALE ×{heightScale.toFixed(1)} (visual only — true heights shown on hover)</div>
      </div>
      <Canvas
        camera={{ position: [75, 55, 75], fov: 48, near: 0.1, far: 2000 }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color("#060A10"), 1)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1 }}
      >
      <SceneLights />
      <CameraController preset={camPreset} />

      {/* Terrain — ONLY renders mask-interior geometry */}
      {surface && mask && (
        <TerrainMesh
          surface={surface}
          mask={mask}
          heightScale={heightScale}
          showWireframe={showWireframe}
        />
      )}

      {/* Entry marker */}
      {entry && <EntryMarker entry={entry} rows={ROWS} cols={COLS} />}

      {/* Live dump markers */}
      {dumpMarkers.slice(-8).map((d, i) => (
        <DumpMarker key={i} r={d.r} c={d.c} rows={ROWS} cols={COLS} />
      ))}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.06}
        minDistance={25}
        maxDistance={350}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, -10, 0]}
      />
    </Canvas>
    </div>
  );
}