'use client';

import { useScroll, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { GLTF } from 'three-stdlib';

type GLTFResult = GLTF & {
  nodes: {
    Object_12: THREE.Mesh; Object_13: THREE.Mesh; Object_14: THREE.Mesh; Object_20: THREE.Mesh;
    Object_21: THREE.Mesh; Object_23: THREE.Mesh; Object_24: THREE.Mesh; Object_16: THREE.Mesh;
    Object_17: THREE.Mesh; Object_18: THREE.Mesh; Object_30: THREE.Mesh; Object_32: THREE.Mesh;
    Object_33: THREE.Mesh; Object_26: THREE.Mesh; Object_27: THREE.Mesh; Object_28: THREE.Mesh;
    Object_39: THREE.Mesh; Object_41: THREE.Mesh; Object_42: THREE.Mesh; Object_35: THREE.Mesh;
    Object_36: THREE.Mesh; Object_37: THREE.Mesh; Object_44: THREE.Mesh; Object_45: THREE.Mesh;
    Object_47: THREE.Mesh; Object_49: THREE.Mesh; Object_51: THREE.Mesh; Object_53: THREE.Mesh;
    Object_54: THREE.Mesh; Object_55: THREE.Mesh; Object_57: THREE.Mesh; Object_59: THREE.Mesh;
    Object_4: THREE.Mesh; Object_5: THREE.Mesh; Object_6: THREE.Mesh; Object_7: THREE.Mesh;
    Object_8: THREE.Mesh; Object_9: THREE.Mesh; Object_10: THREE.Mesh;
  };
  materials: {
    Frosted_glass: THREE.MeshStandardMaterial; Tint_back_glass: THREE.MeshStandardMaterial;
    Glass: THREE.MeshStandardMaterial; Lens: THREE.MeshStandardMaterial;
    Sapphire_miror: THREE.MeshStandardMaterial; Mirror_filter: THREE.MeshStandardMaterial;
    Aluminum: THREE.MeshStandardMaterial; Frame: THREE.MeshStandardMaterial;
    Camera_filter: THREE.MeshStandardMaterial; Plastic_LED: THREE.MeshStandardMaterial;
    Metal_Screw: THREE.MeshStandardMaterial; Display: THREE.MeshStandardMaterial;
    Plastic_antena: THREE.MeshStandardMaterial; Plastic_USB_port: THREE.MeshStandardMaterial;
    material: THREE.MeshStandardMaterial;
  };
};

export function PhoneModel({ scrollProgress }: { scrollProgress: number }) {
  const { nodes, materials } = useGLTF('/model1.glb') as unknown as GLTFResult;
  
  const group = useRef<THREE.Group>(null);
  
  const displayRef = useRef<THREE.Group>(null);
  const chassisRef = useRef<THREE.Group>(null);
  const backGlassRef = useRef<THREE.Group>(null);
  const cameraRef = useRef<THREE.Group>(null);
  const screwsRef = useRef<THREE.Group>(null);
  const boardRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const offset = scrollProgress;
    
    // Smooth cinematic rotation
    if (group.current) {
        group.current.rotation.y = offset * Math.PI * 2.5 + Math.sin(state.clock.elapsedTime * 0.4) * 0.05;
        group.current.rotation.x = offset * 0.8;
        group.current.position.y = -offset * 1.5;
    }

    // Explosion logic based on progress
    // We can map the 0-1 progress to specific ranges
    const explodeProgress = Math.max(0, Math.min(1, (offset - 0.1) / 0.6));

    if (displayRef.current) displayRef.current.position.z = explodeProgress * 2.8;
    
    if (screwsRef.current) {
        screwsRef.current.position.y = -explodeProgress * 2.0;
        screwsRef.current.position.z = explodeProgress * 0.5;
    }
    
    if (boardRef.current) boardRef.current.position.z = -explodeProgress * 0.8;
    
    if (backGlassRef.current) backGlassRef.current.position.z = -explodeProgress * 2.0;
    if (cameraRef.current) cameraRef.current.position.z = -explodeProgress * 3.5;
  });

  return (
    <group ref={group} scale={0.5} dispose={null}>
      
      {/* 1. FRONT DISPLAY ASSEMBLY */}
      <group ref={displayRef}>
        <group scale={30}>
          <mesh geometry={nodes.Object_53.geometry} material={materials.Glass} />
          <mesh geometry={nodes.Object_54.geometry} material={materials.Frame} />
          <mesh geometry={nodes.Object_55.geometry} material={materials.Display} />
        </group>
      </group>

      {/* 2. BOTTOM SCREWS */}
      <group ref={screwsRef}>
        <group scale={30}>
          <mesh geometry={nodes.Object_57.geometry} material={materials.Metal_Screw} />
          <mesh geometry={nodes.Object_59.geometry} material={materials.Metal_Screw} />
        </group>
      </group>

      {/* 3. MAIN CHASSIS (Outer Titanium/Aluminum frame) */}
      <group ref={chassisRef}>
        <group scale={30}>
          <mesh geometry={nodes.Object_4.geometry} material={materials.Aluminum} />
          <mesh geometry={nodes.Object_5.geometry} material={materials.Plastic_antena} />
          <mesh geometry={nodes.Object_6.geometry} material={materials.Plastic_USB_port} />
          <mesh geometry={nodes.Object_10.geometry} material={materials.Metal_Screw} />
          <mesh geometry={nodes.Object_16.geometry} material={materials.Aluminum} />
          <mesh geometry={nodes.Object_17.geometry} material={materials.Frame} />
          <mesh geometry={nodes.Object_26.geometry} material={materials.Aluminum} />
          <mesh geometry={nodes.Object_27.geometry} material={materials.Frame} />
          <mesh geometry={nodes.Object_35.geometry} material={materials.Aluminum} />
          <mesh geometry={nodes.Object_36.geometry} material={materials.Frame} />
        </group>
      </group>

      {/* 4. INTERNAL BOARD/MECHANISMS (separates slightly from chassis) */}
      <group ref={boardRef}>
        <group scale={30}>
          <mesh geometry={nodes.Object_8.geometry} material={materials.material} />
          <mesh geometry={nodes.Object_51.geometry} material={materials.Metal_Screw} />
          <mesh geometry={nodes.Object_49.geometry} material={materials.Frame} />
        </group>
      </group>

      {/* 5. BACK GLASS & Lenses Base */}
      <group ref={backGlassRef}>
        <group scale={30}>
          <mesh geometry={nodes.Object_9.geometry} material={materials.Tint_back_glass} />
          <mesh geometry={nodes.Object_12.geometry} material={materials.Frosted_glass} />
          <mesh geometry={nodes.Object_13.geometry} material={materials.Tint_back_glass} />
          <mesh geometry={nodes.Object_47.geometry} material={materials.Plastic_LED} />
        </group>
      </group>

      {/* 6. REAR CAMERA SENSORS & HOUSINGS */}
      <group ref={cameraRef}>
        <group scale={30}>
          <mesh geometry={nodes.Object_7.geometry} material={materials.Camera_filter} />
          <mesh geometry={nodes.Object_14.geometry} material={materials.Glass} />
          <mesh geometry={nodes.Object_18.geometry} material={materials.Camera_filter} />
          <mesh geometry={nodes.Object_28.geometry} material={materials.Camera_filter} />
          <mesh geometry={nodes.Object_37.geometry} material={materials.Camera_filter} />
          <mesh geometry={nodes.Object_45.geometry} material={materials.Camera_filter} />
          
          <group position={[0.022, 0.061, -0.007]} rotation={[Math.PI / 2, 0, -Math.PI]} scale={[0.352, 0.51, 0.352]}>
            <mesh geometry={nodes.Object_20.geometry} material={materials.Lens} />
            <mesh geometry={nodes.Object_21.geometry} material={materials.Sapphire_miror} />
          </group>
          <group position={[0.022, 0.061, -0.008]} rotation={[Math.PI / 2, 0, -Math.PI]} scale={[1.003, 1, 1.003]}>
            <mesh geometry={nodes.Object_23.geometry} material={materials.Sapphire_miror} />
            <mesh geometry={nodes.Object_24.geometry} material={materials.Mirror_filter} />
          </group>
          <group position={[0.022, 0.041, -0.008]} rotation={[Math.PI / 2, 0, -Math.PI]} scale={[1.003, 1, 1.003]}>
            <mesh geometry={nodes.Object_32.geometry} material={materials.Sapphire_miror} />
            <mesh geometry={nodes.Object_33.geometry} material={materials.Mirror_filter} />
          </group>
          <mesh geometry={nodes.Object_30.geometry} material={materials.Lens} position={[0.022, 0.041, -0.006]} rotation={[Math.PI / 2, 0, -Math.PI]} scale={[0.92, 1.568, 0.92]} />
          
          <group position={[0.004, 0.051, -0.008]} rotation={[Math.PI / 2, 0, -Math.PI]} scale={[1.003, 1, 1.003]}>
            <mesh geometry={nodes.Object_41.geometry} material={materials.Sapphire_miror} />
            <mesh geometry={nodes.Object_42.geometry} material={materials.Mirror_filter} />
          </group>
          <mesh geometry={nodes.Object_39.geometry} material={materials.Lens} position={[0.004, 0.051, -0.007]} rotation={[Math.PI / 2, 0, -Math.PI]} scale={[1.23, 1, 1.23]} />
          <mesh geometry={nodes.Object_44.geometry} material={materials.Lens} />
        </group>
      </group>
      
    </group>
  );
}

useGLTF.preload('/model1.glb');
