import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, OrbitControls } from '@react-three/drei';
import { Mesh } from 'three';

// Floating Food Item Component
function FloatingFood({ position, color }: { position: [number, number, number], color: string }) {
  const meshRef = useRef<Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime + position[0]) * 0.2;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.5 + position[0]) * 0.3;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={meshRef} position={position}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </Float>
  );
}

// Event Calendar Cube
function EventCube({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.1;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.8}>
      <mesh ref={meshRef} position={position}>
        <boxGeometry args={[1, 1, 0.2]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
    </Float>
  );
}

// Floating Particles
function FloatingParticles() {
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < 30; i++) {
      temp.push({
        position: [
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
        ] as [number, number, number],
        scale: Math.random() * 0.3 + 0.1,
      });
    }
    return temp;
  }, []);

  useFrame((state) => {
    particles.forEach((particle, i) => {
      const time = state.clock.elapsedTime;
      particle.position[1] += Math.sin(time + i) * 0.001;
    });
  });

  return (
    <>
      {particles.map((particle, i) => (
        <mesh key={i} position={particle.position}>
          <sphereGeometry args={[particle.scale]} />
          <meshStandardMaterial color="#10b981" transparent opacity={0.6} />
        </mesh>
      ))}
    </>
  );
}

// Main 3D Scene
function Scene() {
  const foodItems = [
    { position: [-4, 2, -2] as [number, number, number], color: "#ef4444" },
    { position: [4, 1, -1] as [number, number, number], color: "#f59e0b" },
    { position: [-2, -1, 1] as [number, number, number], color: "#10b981" },
    { position: [3, -2, 2] as [number, number, number], color: "#8b5cf6" },
    { position: [-5, 0, 3] as [number, number, number], color: "#f59e0b" },
    { position: [1, 3, -3] as [number, number, number], color: "#ef4444" },
  ];

  const eventCubes = [
    { position: [-3, -2, 0] as [number, number, number] },
    { position: [2, 2.5, 1] as [number, number, number] },
    { position: [5, -1, -2] as [number, number, number] },
  ];

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -5]} intensity={0.5} color="#3b82f6" />
      
      {foodItems.map((item, index) => (
        <FloatingFood
          key={`food-${index}`}
          position={item.position}
          color={item.color}
        />
      ))}
      
      {eventCubes.map((cube, index) => (
        <EventCube key={`event-${index}`} position={cube.position} />
      ))}
      
      <FloatingParticles />
      
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 4}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </>
  );
}

export default function Hero3D() {
  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 75 }}
        className="pointer-events-auto"
      >
        <Scene />
      </Canvas>
    </div>
  );
}