"use client";
import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Grid, Text, Html } from "@react-three/drei";
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

// ── Height → colour mapping ───────────────────────────────────────────────────
function heightToRGB(h: number, maxH: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, h / Math.max(maxH, 0.01)));
  // void blue → ore orange → acid yellow → white
  if (t < 0.25) {
    const f = t / 0.25;
    return [f * 0.1, f * 0.25, 0.15 + f * 0.35];
  }
  if (t < 0.55) {
    const f = (t - 0.25) / 0.3;
    return [0.1 + f * 0.9, 0.25 + f * 0.17, 0.5 - f * 0.5];
  }
  if (t < 0.8) {
    const f = (t - 0.55) / 0.25;
    return [1.0, 0.42 + f * 0.37, f * 0.2];
  }
  const f = (t - 0.8) / 0.2;
  return [1.0, 0.79 + f * 0.21, 0.2 + f * 0.8];
}

// ── Terrain mesh ──────────────────────────────────────────────────────────────
function TerrainMesh({ surface, mask, heightScale = 3.5, showWireframe = false }: TerrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ROWS = surface.length;
  const COLS = surface[0].length;

  const { geometry, material } = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    let maxH = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (surface[r][c] > maxH) maxH = surface[r][c];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const h = surface[r][c];
        const inMask = mask[r][c];
        const y = inMask && h > 0 ? h * heightScale : 0;
        // centre the terrain
        positions.push(c - COLS / 2, y, r - ROWS / 2);
        const [rr, gg, bb] = inMask && h > 0
          ? heightToRGB(h, maxH)
          : [0.02, 0.06, 0.09];
        colors.push(rr, gg, bb);
      }
    }

    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const i = r * COLS + c;
        indices.push(i, i + COLS, i + 1);
        indices.push(i + 1, i + COLS, i + COLS + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 80,
      side: THREE.DoubleSide,
      wireframe: showWireframe,
    });

    return { geometry: geo, material: mat };
  }, [surface, mask, heightScale, showWireframe, ROWS, COLS]);

  // cleanup
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  return <mesh ref={meshRef} geometry={geometry} material={material} receiveShadow castShadow />;
}

// ── Dump flash marker ─────────────────────────────────────────────────────────
function DumpMarker({ r, c, rows, cols }: DumpMarkerProps) {
  const ref = useRef<THREE.Mesh>(null);
  const [opacity, setOpacity] = useState(1);

  useFrame(() => {
    if (opacity > 0) setOpacity((o) => Math.max(0, o - 0.03));
  });

  if (opacity <= 0) return null;

  return (
    <mesh
      ref={ref}
      position={[c - cols / 2, 8 + (1 - opacity) * 5, r - rows / 2]}
    >
      <sphereGeometry args={[1.2, 8, 8]} />
      <meshBasicMaterial color="#C8FF00" transparent opacity={opacity} />
    </mesh>
  );
}

// ── Entry point marker ────────────────────────────────────────────────────────
function EntryMarker({ entry, rows, cols }: EntryMarkerProps) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.rotation.y = clock.getElapsedTime() * 0.8;
  });

  const [er, ec] = entry;
  return (
    <group ref={ref} position={[ec - cols / 2, 4, er - rows / 2]}>
      <mesh>
        <coneGeometry args={[1.5, 4, 6]} />
        <meshBasicMaterial color="#FF6B35" transparent opacity={0.85} />
      </mesh>
      {/* Tooltip label */}
      <Html position={[0, 5.5, 0]} distanceFactor={1} occlude="blending">
        <div style={{
          background: "rgba(0, 0, 0, 0.85)",
          border: "1px solid #FF6B35",
          color: "#FF6B35",
          padding: "4px 8px",
          borderRadius: "2px",
          fontFamily: "JetBrains Mono",
          fontSize: "0.65rem",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          textAlign: "center",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}>
          Entry Point ↓<br />
          <span style={{ fontSize: "0.55rem", color: "rgba(255, 107, 53, 0.7)" }}>
            Drop-off location
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
  const animationProgress = useRef(0);

  useEffect(() => {
    // Set end position based on preset
    if (preset === "iso") endPos.current.set(80, 60, 80);
    else if (preset === "top") endPos.current.set(0, 150, 0.1);
    else if (preset === "front") endPos.current.set(0, 30, 140);
    
    // Start animation from current position
    startPos.current.copy(camera.position);
    animationProgress.current = 0;
  }, [preset, camera.position]);

  useFrame(() => {
    if (animationProgress.current < 1) {
      animationProgress.current += 0.08; // Smooth over ~12 frames
      const t = Math.min(animationProgress.current, 1);
      // Ease-out cubic for smooth deceleration
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
      <ambientLight intensity={0.4} color="#1A3A4A" />
      <directionalLight
        position={[50, 80, 40]}
        intensity={1.4}
        color="#C8FF00"
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-60, 40, -50]} intensity={0.5} color="#FF6B35" />
      <pointLight position={[0, 120, 0]} intensity={0.3} color="#ffffff" />
    </>
  );
}

// ── Main exported Scene3D ─────────────────────────────────────────────────────
export default function Scene3D({
  surface,
  mask,
  entry,
  dumpMarkers = [],
  heightScale = 3.5,
  showWireframe = false,
  camPreset = "iso",
}: Scene3DProps) {
  const ROWS = surface?.length ?? 100;
  const COLS = surface?.[0]?.length ?? 100;

  return (
    <Canvas
      camera={{ position: [80, 60, 80], fov: 50, near: 0.1, far: 2000 }}
      shadows
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color("#050A0F"), 1)}
      style={{ width: "100%", height: "100%" }}
    >
      <SceneLights />
      <CameraController preset={camPreset} />

      {/* Base grid */}
      <Grid
        args={[COLS, ROWS]}
        cellSize={10}
        cellThickness={0.3}
        cellColor="#1A3040"
        sectionSize={50}
        sectionThickness={0.5}
        sectionColor="#2A5060"
        fadeDistance={200}
        fadeStrength={1}
        position={[0, -0.1, 0]}
      />

      {/* Terrain */}
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

      {/* Orbit controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={40}
        maxDistance={350}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  );
}
