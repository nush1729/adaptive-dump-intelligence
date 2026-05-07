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
function TerrainMesh({ surface, mask, heightScale = 4.0, showWireframe = false }: TerrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ROWS = surface.length;
  const COLS = surface[0].length;

  const { geometry, material, remap } = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const remap = new Int32Array(ROWS * COLS).fill(-1);
    let vertIdx = 0;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!mask[r][c]) continue;
        positions.push(c - COLS / 2, 0, r - ROWS / 2);
        colors.push(0, 0, 0);
        remap[r * COLS + c] = vertIdx++;
      }
    }

    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const i00 = remap[r * COLS + c];
        const i10 = remap[(r + 1) * COLS + c];
        const i01 = remap[r * COLS + (c + 1)];
        const i11 = remap[(r + 1) * COLS + (c + 1)];

        if (i00 < 0 || i10 < 0 || i01 < 0 || i11 < 0) continue;

        indices.push(i00, i10, i01);
        indices.push(i01, i10, i11);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.15,
      side: THREE.FrontSide,
      wireframe: showWireframe,
      flatShading: false,
    });

    return { geometry: geo, material: mat, remap };
  }, [mask, heightScale, showWireframe, ROWS, COLS]);

  useEffect(() => {
    if (!geometry || !surface || !mask) return;
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
    
    let maxH = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (mask[r][c]) {
          const h = surface[r][c];
          if (isFinite(h) && h > maxH) maxH = h;
        }
      }
    }
    const hRange = Math.max(maxH, 0.01);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!mask[r][c]) continue;
        const idx = remap[r * COLS + c];
        let h = surface[r][c];
        
        // Guard: NaN/Inf → 0
        if (!isFinite(h)) h = 0;
        
        posAttr.setY(idx, h * heightScale);

        if (h <= 0.001) {
          // Visible dark teal base instead of invisible black
          colAttr.setXYZ(idx, 0.03, 0.14, 0.22);
        } else {
          const t = Math.min(1, h / hRange);
          const [rr, gg, bb] = heightToRGB(t);
          colAttr.setXYZ(idx, rr, gg, bb);
        }
      }
    }
    
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [surface, geometry, mask, remap, heightScale, ROWS, COLS]);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  return <mesh ref={meshRef} geometry={geometry} material={material} />;
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
      <Html position={[0, 8, 0]}>
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
      camera.lookAt(0, 0, 0);
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
  heightScale = 4.0,
  showWireframe = false,
  camPreset = "iso",
}: Scene3DProps) {
  const ROWS = surface?.length ?? 100;
  const COLS = surface?.[0]?.length ?? 100;

  return (
    <Canvas
      camera={{ position: [75, 55, 75], fov: 48, near: 0.1, far: 2000 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color("#060A10"), 1)}
      style={{ width: "100%", height: "100%" }}
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
      />
    </Canvas>
  );
}