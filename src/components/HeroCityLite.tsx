import React, { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    InstancedMesh,
    Object3D,
    Color,
    Vector3,
    ShaderMaterial,
    UniformsUtils,
    ShaderLib,
    FrontSide,
    AdditiveBlending
} from 'three';
import { Stars } from '@react-three/drei';

// Shader for the buildings to have a "Tron" pulse effect
const BuildingShaderMaterial = {
    uniforms: UniformsUtils.merge([
        ShaderLib.basic.uniforms,
        {
            uTime: { value: 0 },
            uColor: { value: new Color('#1a1a2e') },
            uGlowColor: { value: new Color('#DC143C') }, // Des Moines Red
            uSecondaryGlowColor: { value: new Color('#4444ff') }, // Blue accent
        }
    ]),
    vertexShader: `
    varying vec3 vPosition;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
      vPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
    }
  `,
    fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uGlowColor;
    uniform vec3 uSecondaryGlowColor;
    varying vec3 vPosition;
    varying vec2 vUv;

    void main() {
      // Base color
      vec3 color = uColor;

      // Grid pattern on the building
      float gridX = step(0.95, fract(vUv.x * 10.0));
      float gridY = step(0.95, fract(vUv.y * 10.0));
      float grid = max(gridX, gridY);

      // Pulse effect moving across the city
      float dist = length(vPosition.xz);
      float pulse = sin(dist * 0.5 - uTime * 2.0) * 0.5 + 0.5;
      
      // Vertical gradient
      float verticalGradient = smoothstep(0.0, 10.0, vPosition.y);

      // Combine effects
      vec3 glow = mix(uSecondaryGlowColor, uGlowColor, pulse);
      
      // Edges are brighter
      float edge = step(0.95, max(abs(vUv.x - 0.5) * 2.0, abs(vUv.y - 0.5) * 2.0));
      
      // Final color mixing
      vec3 finalColor = mix(color, glow, grid * 0.5 + edge * 0.8 * verticalGradient);
      
      // Add a "scanline" effect moving up
      float scanline = smoothstep(0.0, 0.1, abs(fract(vPosition.y * 0.2 - uTime * 0.5) - 0.5));
      finalColor += uGlowColor * (1.0 - scanline) * 0.5;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

function CityInstances({ count = 400 }) {
    const meshRef = useRef<InstancedMesh>(null);
    const materialRef = useRef<ShaderMaterial>(null);
    const dummy = useMemo(() => new Object3D(), []);

    // Generate city layout
    const particles = useMemo(() => {
        const temp = [];
        const gridSize = Math.sqrt(count);
        const spacing = 2.0;

        for (let i = 0; i < count; i++) {
            const x = (i % gridSize - gridSize / 2) * spacing;
            const z = (Math.floor(i / gridSize) - gridSize / 2) * spacing;

            // Skip center for text visibility
            if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

            // Random height based on distance from center (taller in center-ish, shorter at edges)
            const dist = Math.sqrt(x * x + z * z);
            const height = Math.max(1, (20 - dist) * Math.random() * 0.5 + Math.random() * 5);

            temp.push({ x, z, height });
        }
        return temp;
    }, [count]);

    useEffect(() => {
        if (!meshRef.current) return;

        particles.forEach((particle, i) => {
            dummy.position.set(particle.x, particle.height / 2, particle.z);
            dummy.scale.set(1, particle.height, 1);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [dummy, particles]);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
        }
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <boxGeometry args={[1.5, 1, 1.5]} />
            <shaderMaterial
                ref={materialRef}
                attach="material"
                args={[BuildingShaderMaterial]}
                transparent
            />
        </instancedMesh>
    );
}

function FloatingParticles() {
    const count = 100;
    const meshRef = useRef<InstancedMesh>(null);
    const dummy = useMemo(() => new Object3D(), []);

    const particles = useMemo(() => {
        return new Array(count).fill(0).map(() => ({
            x: (Math.random() - 0.5) * 60,
            y: Math.random() * 20 + 5,
            z: (Math.random() - 0.5) * 60,
            speed: Math.random() * 0.2 + 0.1,
            offset: Math.random() * Math.PI * 2
        }));
    }, []);

    useFrame((state) => {
        if (!meshRef.current) return;

        const time = state.clock.elapsedTime;

        particles.forEach((particle, i) => {
            const y = particle.y + Math.sin(time * particle.speed + particle.offset) * 2;
            // Move particles in a circle or flow
            const x = particle.x + Math.cos(time * 0.1 + particle.offset) * 5;
            const z = particle.z + Math.sin(time * 0.1 + particle.offset) * 5;

            dummy.position.set(x, y, z);
            dummy.scale.setScalar(Math.sin(time * 2 + particle.offset) * 0.5 + 0.5);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color="#DC143C" blending={AdditiveBlending} />
        </instancedMesh>
    );
}

function Scene() {
    const { camera } = useThree();

    useFrame((state) => {
        // Subtle camera movement
        const time = state.clock.elapsedTime;
        camera.position.x = Math.sin(time * 0.1) * 5;
        camera.position.z = 20 + Math.cos(time * 0.1) * 5;
        camera.lookAt(0, 5, 0);
    });

    return (
        <>
            <color attach="background" args={['#020916']} />
            <fog attach="fog" args={['#020916', 10, 60]} />
            <ambientLight intensity={0.2} />
            <CityInstances />
            <FloatingParticles />
            <Stars radius={100} depth={50} count={1000} factor={4} saturation={0} fade speed={1} />

            {/* Ground grid for extra Tron feel */}
            <gridHelper args={[100, 50, '#1a1a2e', '#051429']} position={[0, 0, 0]} />
        </>
    );
}

export default function HeroCityLite() {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        console.log("HeroCityLite mounted");
        setIsMounted(true);
    }, []);

    if (!isMounted) return null;

    return (
        <div className="absolute inset-0 w-full h-full z-0 opacity-60">
            <Canvas
                camera={{ position: [0, 15, 25], fov: 60 }}
                dpr={[1, 1.5]} // Limit DPR for performance
                gl={{ antialias: false, powerPreference: "high-performance" }} // Disable AA for performance, Tron style looks fine without it
            >
                <Suspense fallback={null}>
                    <Scene />
                </Suspense>
            </Canvas>
            {/* Overlay to blend with content */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020916]/50 to-[#020916]" />
        </div>
    );
}
