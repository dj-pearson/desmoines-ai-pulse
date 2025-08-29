import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { Mesh, CatmullRomCurve3, Vector3, TubeGeometry } from 'three';

// Interactive Event Wristband component
function EventWristband({ 
  position, 
  color, 
  speed, 
  scale = 1 
}: { 
  position: [number, number, number];
  color: string;
  speed: number;
  scale?: number;
}) {
  const meshRef = useRef<Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * speed;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * speed * 0.5) * 0.1;
      meshRef.current.rotation.z = Math.cos(state.clock.elapsedTime * speed * 0.3) * 0.05;
    }
  });

  // Create curved wristband geometry
  const geometry = useMemo(() => {
    const curve = new CatmullRomCurve3([
      new Vector3(0, 0, 0),
      new Vector3(1, 0.5, 0.5),
      new Vector3(2, 0, 1),
      new Vector3(3, -0.5, 0.5),
      new Vector3(4, 0, 0),
      new Vector3(3, 0.5, -0.5),
      new Vector3(2, 0, -1),
      new Vector3(1, -0.5, -0.5),
      new Vector3(0, 0, 0)
    ]);
    
    return new TubeGeometry(curve, 64, 0.1 * scale, 8, true);
  }, [scale]);

  return (
    <Float speed={speed} rotationIntensity={0.3} floatIntensity={0.5}>
      <mesh ref={meshRef} position={position} scale={scale}>
        <primitive object={geometry} />
        <meshStandardMaterial 
          color={color}
          transparent
          opacity={0.8}
          roughness={0.1}
          metalness={0.3}
          emissive={color}
          emissiveIntensity={0.1}
        />
      </mesh>
    </Float>
  );
}

// Floating Event Badge
function EventBadge({ 
  position, 
  color, 
  size = 0.8 
}: { 
  position: [number, number, number];
  color: string;
  size?: number;
}) {
  const meshRef = useRef<Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.8) * 0.2;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <cylinderGeometry args={[size, size, 0.1, 32]} />
      <meshStandardMaterial 
        color={color}
        transparent
        opacity={0.7}
        roughness={0.2}
        metalness={0.4}
      />
    </mesh>
  );
}

// Main 3D Scene with event-themed elements
function Scene() {
  const wristbands = [
    { position: [-4, 2, -3] as [number, number, number], color: "#8b5cf6", speed: 0.3, scale: 0.8 }, // Purple
    { position: [4, -1, -4] as [number, number, number], color: "#3b82f6", speed: 0.25, scale: 1 }, // Blue
    { position: [-2, -2, -2] as [number, number, number], color: "#10b981", speed: 0.35, scale: 0.6 }, // Green
  ];

  const badges = [
    { position: [-6, 1, -5] as [number, number, number], color: "#f59e0b", size: 0.6 }, // Amber
    { position: [6, 2, -3] as [number, number, number], color: "#ec4899", size: 0.5 }, // Pink
    { position: [0, 3, -6] as [number, number, number], color: "#06b6d4", size: 0.4 }, // Cyan
  ];

  return (
    <>
      {/* Professional lighting setup */}
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 5]} intensity={0.4} color="#ffffff" />
      <pointLight position={[-10, -5, -5]} intensity={0.2} color="#8b5cf6" />
      <spotLight 
        position={[0, 10, 0]} 
        intensity={0.3} 
        angle={0.6} 
        penumbra={0.1}
        color="#3b82f6"
      />
      
      {/* Interactive Event Wristbands */}
      {wristbands.map((wristband, index) => (
        <EventWristband
          key={`wristband-${index}`}
          position={wristband.position}
          color={wristband.color}
          speed={wristband.speed}
          scale={wristband.scale}
        />
      ))}
      
      {/* Event Badges */}
      {badges.map((badge, index) => (
        <EventBadge
          key={`badge-${index}`}
          position={badge.position}
          color={badge.color}
          size={badge.size}
        />
      ))}
    </>
  );
}

export default function Hero3D() {
  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        className="opacity-60"
      >
        <Scene />
      </Canvas>
    </div>
  );
}