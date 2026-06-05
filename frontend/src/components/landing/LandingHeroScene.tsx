"use client";
import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

/* ── Terrain ─────────────────────────────────────────────────── */
function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(100, 100, 80, 80);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h =
        Math.sin(x * 0.1) * Math.cos(z * 0.1) * 4 +
        Math.sin(x * 0.2 + 1) * 1.8 +
        Math.cos(z * 0.15 + 0.7) * 2.2 +
        Math.sin((x + z) * 0.07) * 2.8;
      pos.setY(i, h);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <>
      <mesh geometry={geo} rotation={[-Math.PI / 2.2, 0, 0.2]} position={[0, -8, 0]}>
        <meshStandardMaterial color="#0B1520" emissive="#FFCD11" emissiveIntensity={0.03} roughness={0.9} />
      </mesh>
      <mesh geometry={geo} rotation={[-Math.PI / 2.2, 0, 0.2]} position={[0, -7.9, 0]}>
        <meshBasicMaterial color="#FFCD11" wireframe opacity={0.055} transparent />
      </mesh>
    </>
  );
}

/* ── Dump-site pile markers ───────────────────────────────────── */
function DumpPiles() {
  const piles = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      x: (Math.random() - 0.5) * 50,
      z: (Math.random() - 0.5) * 50,
      scale: 0.4 + Math.random() * 0.8,
      color: i % 4 === 0 ? "#FFCD11" : i % 4 === 1 ? "#00D4FF" : i % 4 === 2 ? "#FF6B35" : "#22C55E",
    })), []);

  return (
    <group position={[0, -7, 0]}>
      {piles.map((p, i) => (
        <mesh key={i} position={[p.x, p.scale * 0.5, p.z]}>
          <coneGeometry args={[p.scale * 0.6, p.scale, 6]} />
          <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Individual animated truck ───────────────────────────────── */
interface TruckProps {
  orbitRadius: number;
  orbitSpeed: number;
  phase: number;
  color: string;
  scale?: number;
  yBase?: number;
}

function Truck({ orbitRadius, orbitSpeed, phase, color, scale = 1, yBase = -5.5 }: TruckProps) {
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * orbitSpeed + phase;
    const x = Math.cos(t) * orbitRadius;
    const z = Math.sin(t) * orbitRadius;
    if (!group.current) return;
    group.current.position.set(x, yBase, z);
    group.current.rotation.y = -t + Math.PI / 2;
  });

  return (
    <group ref={group} scale={scale}>
      {/* Body */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[3.5, 1.2, 1.8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Cab */}
      <mesh position={[-0.9, 1.55, 0]}>
        <boxGeometry args={[1.4, 0.95, 1.7]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.5} roughness={0.45} />
      </mesh>
      {/* Dump bed */}
      <mesh position={[0.6, 1.4, 0]}>
        <boxGeometry args={[2.0, 0.15, 1.6]} />
        <meshStandardMaterial color="#1A2535" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Wheels */}
      {([-1.3, 1.3] as number[]).map((sx) =>
        ([-0.95, 0.95] as number[]).map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx, 0.28, sz]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.28, 12]} />
            <meshStandardMaterial color="#111827" metalness={0.4} roughness={0.7} />
          </mesh>
        ))
      )}
      {/* Headlights */}
      <pointLight position={[-2, 0.8, 0.5]} color="#FFFFCC" intensity={2.5} distance={14} />
      <pointLight position={[-2, 0.8, -0.5]} color="#FFFFCC" intensity={2.5} distance={14} />
      {/* Headlight mesh glow */}
      <mesh position={[-1.8, 0.8, 0.55]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshBasicMaterial color="#FFFFAA" />
      </mesh>
      <mesh position={[-1.8, 0.8, -0.55]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshBasicMaterial color="#FFFFAA" />
      </mesh>
      {/* Tail light glow */}
      <pointLight position={[2, 0.8, 0]} color={color} intensity={1.0} distance={8} />
      <mesh position={[1.85, 0.75, 0.6]}>
        <sphereGeometry args={[0.07, 6, 6]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[1.85, 0.75, -0.6]}>
        <sphereGeometry args={[0.07, 6, 6]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

/* ── Data ring ───────────────────────────────────────────────── */
function DataRing() {
  const groupRef = useRef<THREE.Group>(null);
  const nodes = useMemo(() =>
    Array.from({ length: 28 }, (_, i) => {
      const angle = (i / 28) * Math.PI * 2;
      const r = 36 + Math.sin(i * 1.7) * 5;
      return { x: Math.cos(angle) * r, z: Math.sin(angle) * r, y: -3 + Math.sin(i * 0.9) * 2.5, s: 0.1 + (i % 3) * 0.07 };
    }), []);

  useFrame(({ clock }) => {
    if (groupRef.current) groupRef.current.rotation.y = clock.getElapsedTime() * 0.04;
  });

  return (
    <group ref={groupRef}>
      {nodes.map((n, i) => (
        <mesh key={i} position={[n.x, n.y, n.z]}>
          <octahedronGeometry args={[n.s, 0]} />
          <meshBasicMaterial color={i % 3 === 0 ? "#00D4FF" : i % 3 === 1 ? "#FFCD11" : "#22C55E"} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Scan beam ────────────────────────────────────────────────── */
function ScanBeam() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.z = Math.sin(t * 0.5) * 42;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.abs(Math.sin(t * 0.5)) * 0.1;
  });
  return (
    <mesh ref={ref} position={[0, -3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[100, 1]} />
      <meshBasicMaterial color="#FFCD11" transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

/* ── Foreground hero truck (stationary, large, centre-frame) ─── */
function HeroTruck() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    // Subtle idle bob
    groupRef.current.position.y = -4.5 + Math.sin(clock.getElapsedTime() * 0.6) * 0.15;
  });

  const color = "#FFCD11";
  return (
    <group ref={groupRef} position={[2, -4.5, 8]} rotation={[0, -0.25, 0]} scale={1.9}>
      {/* Body */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[3.5, 1.2, 1.8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Cab */}
      <mesh position={[-0.9, 1.55, 0]}>
        <boxGeometry args={[1.4, 0.95, 1.7]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} metalness={0.6} roughness={0.35} />
      </mesh>
      {/* Dump bed */}
      <mesh position={[0.6, 1.4, 0]}>
        <boxGeometry args={[2.0, 0.15, 1.6]} />
        <meshStandardMaterial color="#1A2535" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Load in bed */}
      <mesh position={[0.6, 1.58, 0]}>
        <boxGeometry args={[1.8, 0.25, 1.4]} />
        <meshStandardMaterial color="#5A4020" roughness={0.9} />
      </mesh>
      {/* Wheels — 4 pairs */}
      {([-1.3, 1.3] as number[]).map((sx) =>
        ([-0.95, 0.95] as number[]).map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx, 0.28, sz]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.36, 0.36, 0.3, 14]} />
            <meshStandardMaterial color="#111827" metalness={0.5} roughness={0.6} />
          </mesh>
        ))
      )}
      {/* Headlights */}
      <pointLight position={[-2.2, 0.8, 0.5]} color="#FFFFCC" intensity={4.0} distance={20} />
      <pointLight position={[-2.2, 0.8, -0.5]} color="#FFFFCC" intensity={4.0} distance={20} />
      <mesh position={[-1.85, 0.8, 0.6]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color="#FFFFAA" />
      </mesh>
      <mesh position={[-1.85, 0.8, -0.6]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color="#FFFFAA" />
      </mesh>
      {/* Under-glow */}
      <pointLight position={[0, -0.2, 0]} color={color} intensity={1.5} distance={6} />
      {/* CAT label stripe */}
      <mesh position={[0, 0.72, 0.91]}>
        <boxGeometry args={[2.0, 0.18, 0.01]} />
        <meshBasicMaterial color="#000" />
      </mesh>
    </group>
  );
}

/* ── Export ──────────────────────────────────────────────────── */
export default function LandingHeroScene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      {/* Camera pulled closer and angled slightly down for better truck view */}
      <PerspectiveCamera makeDefault position={[0, 6, 28]} fov={58} />
      <ambientLight intensity={0.18} />
      <directionalLight position={[25, 35, 15]} intensity={0.7} color="#FFCD11" />
      <directionalLight position={[-25, 15, -15]} intensity={0.35} color="#00D4FF" />
      <pointLight position={[0, 25, 0]} intensity={1.4} color="#FFCD11" distance={80} />
      {/* Spotlight on hero truck */}
      <spotLight
        position={[2, 14, 10]}
        target-position={[2, -4, 8] as unknown as THREE.Object3D}
        angle={0.35}
        penumbra={0.5}
        intensity={6}
        color="#FFCD11"
        distance={30}
      />

      <Terrain />
      <DumpPiles />
      <ScanBeam />
      <DataRing />

      {/* Hero truck — large, stationary, centre-frame */}
      <HeroTruck />

      {/* Background trucks orbiting at larger radius */}
      <Truck orbitRadius={22} orbitSpeed={0.20} phase={0} color="#FFCD11" scale={0.7} yBase={-5.5} />
      <Truck orbitRadius={30} orbitSpeed={0.15} phase={2.1} color="#00D4FF" scale={0.62} yBase={-5.8} />
      <Truck orbitRadius={17} orbitSpeed={0.28} phase={4.2} color="#FF6B35" scale={0.58} yBase={-6.0} />

      {/* Reduced fog near distance for better foreground visibility */}
      <fog attach="fog" args={["#080A0D", 40, 110]} />

      <EffectComposer multisampling={0}>
        <Bloom intensity={1.4} luminanceThreshold={0.3} luminanceSmoothing={0.4} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
