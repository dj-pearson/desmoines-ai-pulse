import React, { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  OrbitControls, 
  Stars, 
  useTexture,
  Plane
} from '@react-three/drei';
import { 
  Mesh, 
  Group,
  BoxGeometry,
  MeshPhongMaterial,
  MeshLambertMaterial,
  Color,
  Vector3,
  DirectionalLight,
  AmbientLight,
  PointLight,
  Fog
} from 'three';

// Loading Fallback Component
function LoadingFallback() {
  return (
    <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#2D1B69] to-[#8B0000] opacity-20 flex items-center justify-center">
      <div className="text-white text-lg">Loading cityscape...</div>
    </div>
  );
}

// City Building Component
function Building({ 
  position, 
  height, 
  width = 1, 
  depth = 1, 
  color = '#2D1B69',
  windowsOn = true 
}: {
  position: [number, number, number];
  height: number;
  width?: number;
  depth?: number;
  color?: string;
  windowsOn?: boolean;
}) {
  const meshRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);

  // Subtle floating animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.5 + position[0]) * 0.05;
    }
  });

  // Create windows
  const windows = useMemo(() => {
    if (!windowsOn) return [];
    
    const windowArray = [];
    const windowsPerFloor = Math.floor(width * 2);
    const floors = Math.floor(height * 3);
    
    for (let floor = 0; floor < floors; floor++) {
      for (let w = 0; w < windowsPerFloor; w++) {
        if (Math.random() > 0.3) { // 70% chance of window being lit
          windowArray.push({
            x: (w - windowsPerFloor / 2) * 0.3,
            y: (floor - floors / 2) * 0.3,
            z: width / 2 + 0.01
          });
        }
      }
    }
    return windowArray;
  }, [height, width, windowsOn]);

  return (
    <group ref={groupRef} position={position}>
      {/* Main building */}
      <mesh ref={meshRef}>
        <boxGeometry args={[width, height, depth]} />
        <meshPhongMaterial 
          color={color} 
          transparent 
          opacity={0.9}
          shininess={30}
        />
      </mesh>
      
      {/* Windows */}
      {windows.map((window, index) => (
        <mesh key={index} position={[window.x, window.y, window.z]}>
          <boxGeometry args={[0.1, 0.15, 0.02]} />
          <meshLambertMaterial 
            color="#FFD700" 
            emissive="#FFD700"
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
      
      {/* Roof detail */}
      <mesh position={[0, height/2 + 0.1, 0]}>
        <boxGeometry args={[width + 0.1, 0.2, depth + 0.1]} />
        <meshPhongMaterial color="#8B0000" />
      </mesh>
    </group>
  );
}

// City Grid Component
function CityGrid() {
  const buildings = useMemo(() => {
    const buildingArray = [];
    const gridSize = 20;
    const spacing = 3;
    
    for (let x = -gridSize; x <= gridSize; x += spacing) {
      for (let z = -gridSize; z <= gridSize; z += spacing) {
        // Skip center area for hero content
        if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
        
        const height = Math.random() * 6 + 2;
        const width = Math.random() * 1.5 + 0.8;
        const depth = Math.random() * 1.5 + 0.8;
        
        // Use brand colors
        const colors = ['#2D1B69', '#1e3a8a', '#3730a3', '#1e40af'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        buildingArray.push({
          position: [x, height/2, z] as [number, number, number],
          height,
          width,
          depth,
          color,
          windowsOn: Math.random() > 0.2
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
          color={building.color}
          windowsOn={building.windowsOn}
        />
      ))}
    </>
  );
}

// Flying Elements (representing events/activities)
function FloatingElement({ 
  position, 
  color = '#DC143C', 
  speed = 1 
}: {
  position: [number, number, number];
  color?: string;
  speed?: number;
}) {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.x = position[0] + Math.sin(state.clock.elapsedTime * speed) * 2;
      meshRef.current.position.y = position[1] + Math.cos(state.clock.elapsedTime * speed * 0.7) * 1;
      meshRef.current.position.z = position[2] + Math.sin(state.clock.elapsedTime * speed * 0.5) * 1.5;
      meshRef.current.rotation.y = state.clock.elapsedTime * speed;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.2, 0.2, 0.2]} />
      <meshPhongMaterial 
        color={color} 
        emissive={color}
        emissiveIntensity={0.2}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

// Ground/Street System
function GroundPlane() {
  return (
    <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[100, 100]} />
      <meshLambertMaterial 
        color="#1a1a2e"
        transparent 
        opacity={0.8}
      />
    </mesh>
  );
}

// Street Lights
function StreetLight({ position }: { position: [number, number, number] }) {
  const lightRef = useRef<PointLight>(null);
  
  useFrame((state) => {
    if (lightRef.current) {
      lightRef.current.intensity = 0.3 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 4]} />
        <meshPhongMaterial color="#444444" />
      </mesh>
      
      {/* Light */}
      <mesh position={[0, 4.2, 0]}>
        <sphereGeometry args={[0.2]} />
        <meshLambertMaterial 
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={0.5}
        />
      </mesh>
      
      {/* Point Light */}
      <pointLight
        ref={lightRef}
        position={[0, 4, 0]}
        color="#FFD700"
        intensity={0.3}
        distance={8}
      />
    </group>
  );
}

// Camera Controller for smooth movement
function CameraController() {
  const { camera } = useThree();
  
  useFrame((state) => {
    // Smooth camera orbit
    const time = state.clock.elapsedTime * 0.2;
    camera.position.x = Math.sin(time) * 15;
    camera.position.z = Math.cos(time) * 15;
    camera.position.y = 8 + Math.sin(time * 0.5) * 2;
    camera.lookAt(0, 2, 0);
  });

  return null;
}

// Main Scene
function CityScene() {
  // Street lights positions
  const streetLights = useMemo(() => {
    const lights = [];
    for (let x = -15; x <= 15; x += 6) {
      for (let z = -15; z <= 15; z += 6) {
        // Skip center area and some random positions
        if ((Math.abs(x) < 4 && Math.abs(z) < 4) || Math.random() > 0.7) continue;
        lights.push([x, 0, z] as [number, number, number]);
      }
    }
    return lights;
  }, []);

  // Floating elements
  const floatingElements = useMemo(() => [
    { position: [8, 6, 5] as [number, number, number], color: '#DC143C', speed: 0.8 },
    { position: [-6, 8, -3] as [number, number, number], color: '#FF6B6B', speed: 1.2 },
    { position: [4, 10, -8] as [number, number, number], color: '#8B0000', speed: 0.6 },
    { position: [-8, 7, 6] as [number, number, number], color: '#DC143C', speed: 1.0 },
    { position: [10, 9, -2] as [number, number, number], color: '#FF4444', speed: 0.9 },
  ], []);

  return (
    <>
      {/* Lighting Setup */}
      <ambientLight intensity={0.2} color="#ffffff" />
      <directionalLight
        position={[10, 10, 5]}
        intensity={0.4}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight
        position={[-10, 8, -5]}
        intensity={0.2}
        color="#2D1B69"
      />

      {/* Atmosphere */}
      <fog attach="fog" args={['#0a0a0a', 20, 50]} />
      
      {/* Stars */}
      <Stars 
        radius={300} 
        depth={60} 
        count={1000} 
        factor={4} 
        saturation={0}
        fade={true}
      />

      {/* Ground */}
      <GroundPlane />

      {/* City Buildings */}
      <CityGrid />

      {/* Street Lights */}
      {streetLights.map((position, index) => (
        <StreetLight key={index} position={position} />
      ))}

      {/* Floating Elements */}
      {floatingElements.map((element, index) => (
        <FloatingElement
          key={index}
          position={element.position}
          color={element.color}
          speed={element.speed}
        />
      ))}

      {/* Camera Animation */}
      <CameraController />
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
      <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#2D1B69] to-[#8B0000] opacity-30" />
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
            position: [15, 8, 15], 
            fov: 60,
            near: 0.1,
            far: 1000
          }}
          className="opacity-80"
          gl={{
            antialias: typeof window !== 'undefined' ? window.innerWidth > 768 : false,
            alpha: true,
            powerPreference: "high-performance"
          }}
          dpr={[1, typeof window !== 'undefined' && window.innerWidth > 1200 ? 2 : 1]}
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
