"use client";
import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";

function PremiumTerrain() {
  const meshRef = useRef<THREE.Group>(null);
  const scanRef = useRef<THREE.Mesh>(null);

  const { geometry, material } = useMemo(() => {
    const size = 88;
    const segments = 88;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const radial = Math.sqrt(x * x + z * z) / 58;
      const ridge =
        Math.sin(x * 0.22) * 1.2 +
        Math.cos(z * 0.18) * 1.0 +
        Math.sin((x + z) * 0.095) * 1.7;
      const moundA = Math.exp(-((x + 16) ** 2 + (z - 10) ** 2) / 520) * 10;
      const moundB = Math.exp(-((x - 18) ** 2 + (z + 14) ** 2) / 380) * 7;
      const height = Math.max(-0.8, ridge + moundA + moundB - radial * 5);
      pos.setY(i, height);

      const t = THREE.MathUtils.clamp((height + 2) / 13, 0, 1);
      color.set(t > 0.62 ? "#FFC000" : t > 0.36 ? "#0EA5A8" : "#07131B");
      if (t > 0.82) color.lerp(new THREE.Color("#FF5722"), (t - 0.82) / 0.18);
      colors.push(color.r, color.g, color.b);
    }

    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.46,
      metalness: 0.22,
      side: THREE.FrontSide,
    });

    return { geometry: geo, material: mat };
  }, []);

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(t * 0.16) * 0.08 + pointer.x * 0.05;
      meshRef.current.rotation.x = pointer.y * 0.025;
    }
    if (scanRef.current) {
      scanRef.current.position.z = ((t * 18) % 90) - 45;
      const mat = scanRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.18 + Math.sin(t * 3) * 0.04;
    }
  });

  return (
    <group ref={meshRef} position={[0, -9, 0]}>
      <mesh geometry={geometry} material={material} />
      <mesh ref={scanRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 8.5, -45]}>
        <planeGeometry args={[92, 1.2]} />
        <meshBasicMaterial color="#FFC000" transparent opacity={0.22} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function OrbitingTelemetry() {
  const groupRef = useRef<THREE.Group>(null);
  const dots = useMemo(() => {
    return Array.from({ length: 44 }, (_, i) => {
      const angle = (i / 44) * Math.PI * 2;
      const radius = 34 + (i % 4) * 5;
      return {
        position: new THREE.Vector3(Math.cos(angle) * radius, 2 + (i % 7), Math.sin(angle) * radius),
        scale: i % 9 === 0 ? 0.38 : 0.22,
      };
    });
  }, []);

  useFrame(({ clock, pointer }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = clock.getElapsedTime() * 0.11 + pointer.x * 0.08;
  });

  return (
    <group ref={groupRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.5, 0]}>
        <ringGeometry args={[36, 36.15, 96]} />
        <meshBasicMaterial color="#FFC000" transparent opacity={0.32} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.8, 0]}>
        <ringGeometry args={[48, 48.08, 128]} />
        <meshBasicMaterial color="#FF5722" transparent opacity={0.18} />
      </mesh>
      {dots.map((dot, i) => (
        <mesh key={i} position={dot.position} scale={dot.scale}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial color={i % 5 === 0 ? "#FF5722" : "#FFC000"} transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function IndustrialLights() {
  return (
    <>
      <ambientLight intensity={0.38} />
      <directionalLight position={[30, 55, 35]} intensity={2.1} color="#FFF4C2" />
      <directionalLight position={[-45, 20, -35]} intensity={0.75} color="#36D6FF" />
      <pointLight position={[0, 18, 32]} intensity={22} color="#FFC000" distance={92} />
      <pointLight position={[-35, 14, -24]} intensity={10} color="#FF5722" distance={72} />
    </>
  );
}

export default function LandingHeroScene() {
  return (
    <Canvas
      dpr={[1, 1.6]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <PerspectiveCamera makeDefault position={[60, 36, 72]} fov={43} />
      <color attach="background" args={["#050608"]} />
      <fog attach="fog" args={["#050608", 70, 155]} />
      <IndustrialLights />
      <PremiumTerrain />
      <OrbitingTelemetry />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.25}
        minPolarAngle={Math.PI / 3.6}
        maxPolarAngle={Math.PI / 2.18}
      />
    </Canvas>
  );
}
