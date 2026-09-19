'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { PhoneModel } from './HeroModel';

interface Desktop3DSceneProps {
  proxyRef: React.MutableRefObject<{ progress: number }>;
}

export default function Desktop3DScene({ proxyRef }: Desktop3DSceneProps) {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 15], fov: 45 }}
        dpr={[1, 2]} // Optimize pixel ratio
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <Environment preset="studio" />
          
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          
          <PhoneModel proxyRef={proxyRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}
