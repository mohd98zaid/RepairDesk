'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

export function PhoneModel({ proxyRef }: { proxyRef: React.MutableRefObject<{ progress: number }> }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!proxyRef?.current || !meshRef.current) return;
    const offset = proxyRef.current.progress;

    // Simple animation: rotate and move up/down based on scroll progress
    meshRef.current.rotation.y = offset * Math.PI * 2; // Full rotation
    meshRef.current.rotation.x = offset * Math.PI;     // Tilt
    meshRef.current.position.y = offset * 2 - 1;       // Move from -1 to 1
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  );
}
