import React, { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  Stars
} from '@react-three/drei';
import { 
  Mesh, 
  Group,
  BoxGeometry,
  MeshPhongMaterial,
  MeshLambertMaterial,
  Color,
  Vector3,
  Vector2,
  DirectionalLight,
  AmbientLight,
  PointLight,
  Fog,
  EdgesGeometry,
  LineBasicMaterial
} from 'three';

// Loading Fallback Component
function LoadingFallback() {
  return (
    <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#020916] to-[#051429] opacity-20 flex items-center justify-center">
      <div className="text-white text-lg">Loading cityscape...</div>
    </div>
  );
}

// Mouse-controlled Camera Component
function MouseControlledCamera() {
  const { camera, size } = useThree();
  const mousePosition = useRef(new Vector2(0, 0));

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mousePosition.current.x = (event.clientX / size.width) * 2 - 1;
      mousePosition.current.y = -(event.clientY / size.height) * 2 + 1;
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [size]);

  useFrame(() => {
    // Smooth camera movement based on mouse position
    const targetX = mousePosition.current.x * 5;
    const targetY = mousePosition.current.y * 3 + 8;
    const targetZ = 15 + mousePosition.current.x * 2;

    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y += (targetY - camera.position.y) * 0.05;
    camera.position.z += (targetZ - camera.position.z) * 0.05;
    
    camera.lookAt(0, 2, 0);
  });

  return null;
}

// City Building Component with Glow
function Building({ 
  position, 
  height, 
  width = 1, 
  depth = 1, 
  hasGlow = false 
}: {
  position: [number, number, number];
  height: number;
  width?: number;
  depth?: number;
  hasGlow?: boolean;
}) {
  const meshRef = useRef<Mesh>(null);
  const glowRef = useRef<Mesh>(null);

  // Pulsing glow animation
  useFrame((state) => {
    if (glowRef.current && hasGlow) {
      const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.3 + 0.7;
      glowRef.current.scale.setScalar(pulse);
      const material = Array.isArray(glowRef.current.material) ? glowRef.current.material[0] : glowRef.current.material;
      if (material) {
        material.opacity = pulse * 0.6;
      }
    }
  });

  return (
    <group position={position}>
      {/* Main building - dark blue */}
      <mesh ref={meshRef}>
        <boxGeometry args={[width, height, depth]} />
        <meshPhongMaterial 
          color="#1a1a2e" 
          shininess={10}
          specular="#2D1B69"
        />
      </mesh>
      
      {/* Glowing overlay for special buildings */}
      {hasGlow && (
        <mesh ref={glowRef} position={[0, 0, 0]}>
          <boxGeometry args={[width + 0.1, height + 0.1, depth + 0.1]} />
          <meshLambertMaterial 
            color="#DC143C"
            emissive="#DC143C"
            emissiveIntensity={0.4}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
      
      {/* Building edges/details */}
      <lineSegments>
        <edgesGeometry args={[new BoxGeometry(width, height, depth)]} />
        <lineBasicMaterial color={hasGlow ? "#FF4444" : "#87CEEB"} />
      </lineSegments>
    </group>
  );
}

// City Grid Component
function CityGrid() {
  const buildings = useMemo(() => {
    const buildingArray = [];
    const gridSize = 12;
    const spacing = 2.5;
    
    for (let x = -gridSize; x <= gridSize; x += spacing) {
      for (let z = -gridSize; z <= gridSize; z += spacing) {
        // Skip center area for hero content
        if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;
        
        const height = Math.random() * 4 + 1.5;
        const width = Math.random() * 0.8 + 0.6;
        const depth = Math.random() * 0.8 + 0.6;
        
        // Random chance for glowing buildings (like the pink ones in CodePen)
        const hasGlow = Math.random() > 0.85;
        
        buildingArray.push({
          position: [x, height/2, z] as [number, number, number],
          height,
          width,
          depth,
          hasGlow
        });
      }
    }
    return buildingArray;
  }, []);

  return (
    <>
      {buildings.map((building, index) => (
        <Building
          key={index}
          position={building.position}
          height={building.height}
          width={building.width}
          depth={building.depth}
          hasGlow={building.hasGlow}
        />
      ))}
    </>
  );
}

// Floating Particles/Elements
function FloatingParticles() {
  const particlesRef = useRef<Group>(null);
  
  const particles = useMemo(() => {
    const particleArray = [];
    for (let i = 0; i < 20; i++) {
      particleArray.push({
        position: [
          (Math.random() - 0.5) * 30,
          Math.random() * 15 + 5,
          (Math.random() - 0.5) * 30
        ] as [number, number, number],
        speed: Math.random() * 0.5 + 0.2
      });
    }
    return particleArray;
  }, []);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.children.forEach((particle, index) => {
        particle.position.y += Math.sin(state.clock.elapsedTime + index) * 0.01;
        particle.rotation.y = state.clock.elapsedTime * particles[index].speed;
      });
    }
  });

  return (
    <group ref={particlesRef}>
      {particles.map((particle, index) => (
        <mesh key={index} position={particle.position}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshLambertMaterial 
            color="#DC143C"
            emissive="#DC143C"
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

// Ground Plane
function GroundPlane() {
  return (
    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[60, 60]} />
      <meshLambertMaterial 
        color="#020916"
        transparent 
        opacity={0.9}
      />
    </mesh>
  );
}

// Main Scene
function CityScene() {
  const { scene } = useThree();
  
  // Set scene background color to match header
  React.useEffect(() => {
    scene.background = new Color('#020916');
  }, [scene]);

  return (
    <>
      {/* Lighting Setup - matching CodePen style */}
      <ambientLight intensity={0.1} color="#ffffff" />
      <directionalLight
        position={[10, 10, 5]}
        intensity={0.3}
        color="#ffffff"
      />
      <directionalLight
        position={[-10, 8, -5]}
        intensity={0.2}
        color="#DC143C"
      />

      {/* Atmosphere - dark with red tint like CodePen */}
      <fog attach="fog" args={['#020916', 10, 35]} />
      
      {/* Minimal stars for atmosphere */}
      <Stars 
        radius={200} 
        depth={50} 
        count={200} 
        factor={2} 
        saturation={0}
        fade={true}
      />

      {/* Ground */}
      <GroundPlane />

      {/* City Buildings */}
      <CityGrid />

      {/* Floating Particles */}
      <FloatingParticles />

      {/* Mouse-controlled Camera */}
      <MouseControlledCamera />
    </>
  );
}

// Main Hero3D Component
export default function Hero3DCityscape() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Error boundary effect
  useEffect(() => {
    const handleError = () => setHasError(true);
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#020916] to-[#051429] opacity-30" />
    );
  }

  if (!isLoaded) {
    return <LoadingFallback />;
  }

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden">
      <Suspense fallback={<LoadingFallback />}>
        <Canvas
          camera={{ 
            position: [0, 8, 15], 
            fov: 75,
            near: 0.1,
            far: 1000
          }}
          className="opacity-90"
          style={{ background: '#020916' }}
          gl={{
            antialias: typeof window !== 'undefined' ? window.innerWidth > 768 : false,
            alpha: false,
            powerPreference: "high-performance"
          }}
          dpr={[1, typeof window !== 'undefined' && window.innerWidth > 1200 ? 1.5 : 1]}
          onError={() => setHasError(true)}
        >
          <CityScene />
        </Canvas>
      </Suspense>
      
      {/* Gradient overlay to ensure text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20 pointer-events-none" />
    </div>
  );
}
