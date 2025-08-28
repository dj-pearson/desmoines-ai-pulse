import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { Mesh } from 'three';

// Subtle floating geometric shape
function FloatingShape({ position, color, size, speed }: { 
  position: [number, number, number], 
  color: string, 
  size: number,
  speed: number 
}) {
  const meshRef = useRef<Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * speed) * 0.1;
      meshRef.current.rotation.x = Math.cos(state.clock.elapsedTime * speed * 0.7) * 0.05;
    }
  });

  return (
    <Float speed={speed} rotationIntensity={0.2} floatIntensity={0.3}>
      <mesh ref={meshRef} position={position}>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial 
          color={color} 
          transparent 
          opacity={0.6}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>
    </Float>
  );
}

// Subtle floating sphere for accent
function FloatingSphere({ position, color, size }: { 
  position: [number, number, number], 
  color: string, 
  size: number 
}) {
  const meshRef = useRef<Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
    }
  });

  return (
    <Float speed={1} rotationIntensity={0.1} floatIntensity={0.4}>
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[size]} />
        <meshStandardMaterial 
          color={color} 
          transparent 
          opacity={0.4}
          roughness={0.2}
          metalness={0.2}
        />
      </mesh>
    </Float>
  );
}

// Main 3D Scene with subtle, professional elements
function Scene() {
  // Professional color palette that matches your brand
  const shapes = [
    { position: [-6, 3, -4] as [number, number, number], color: "#3b82f6", size: 1.2, speed: 0.3 }, // Blue
    { position: [6, 2, -3] as [number, number, number], color: "#10b981", size: 1, speed: 0.4 }, // Green
    { position: [-4, -2, -2] as [number, number, number], color: "#8b5cf6", size: 0.8, speed: 0.35 }, // Purple
    { position: [4, -1, -5] as [number, number, number], color: "#f59e0b", size: 1.1, speed: 0.25 }, // Amber
  ];

  const spheres = [
    { position: [-8, 1, -6] as [number, number, number], color: "#06b6d4", size: 0.6 }, // Cyan
    { position: [8, -3, -4] as [number, number, number], color: "#ec4899", size: 0.5 }, // Pink
    { position: [2, 4, -7] as [number, number, number], color: "#84cc16", size: 0.4 }, // Lime
  ];

  return (
    <>
      {/* Soft ambient lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.3} color="#ffffff" />
      <pointLight position={[-10, -10, -5]} intensity={0.2} color="#3b82f6" />
      
      {/* Subtle floating shapes */}
      {shapes.map((shape, index) => (
        <FloatingShape
          key={`shape-${index}`}
          position={shape.position}
          color={shape.color}
          size={shape.size}
          speed={shape.speed}
        />
      ))}
      
      {/* Accent spheres */}
      {spheres.map((sphere, index) => (
        <FloatingSphere
          key={`sphere-${index}`}
          position={sphere.position}
          color={sphere.color}
          size={sphere.size}
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