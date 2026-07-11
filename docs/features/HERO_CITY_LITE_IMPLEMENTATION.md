# Hero City Lite Implementation

## Overview
Replaced the heavy `Hero3DCityscape` component with a highly optimized `HeroCityLite` component. The new implementation maintains the "Tron-like" aesthetic and "Des Moines Red" branding but uses advanced Three.js techniques to drastically reduce performance overhead.

## Key Optimizations

### 1. Instanced Rendering (`InstancedMesh`)
- **Previous**: 100+ individual `Mesh` components, each with its own draw call and overhead.
- **New**: Single `InstancedMesh` for all buildings (400+ buildings) and another for particles.
- **Result**: Reduces draw calls from ~300+ to just 2-3, significantly improving CPU/GPU communication.

### 2. GPU-Based Animations (Custom Shaders)
- **Previous**: `useFrame` hook running in *every single building component* (100+ times per frame) to animate opacity/scale. This bottlenecked the JS thread.
- **New**: Custom `ShaderMaterial` handles all glow and pulse animations on the GPU.
- **Result**: Zero per-building CPU overhead for animations. The JS thread only updates a single `uTime` uniform per frame.

### 3. Optimized Geometry
- **Previous**: Complex `EdgesGeometry` and multiple meshes per building.
- **New**: Single `BoxGeometry` reused for all instances. Visual complexity (grids, edges, glowing pulse) is procedurally generated in the fragment shader.

## Features
- **Tron Aesthetic**: Dark blue/black background with neon red (`#DC143C`) and blue accents.
- **Dynamic Pulse**: A "wave" of light ripples through the city, simulated in the shader.
- **Floating Particles**: "Flying cars" or data packets moving through the city, also instanced.
- **Responsive**: Adapts to screen size and performance settings (dpr limited).

## Usage
The component is lazy-loaded in `EnhancedHero.tsx` to ensure it doesn't block the initial page load.

```tsx
const HeroCityLite = lazy(() => import("./HeroCityLite"));
```

## Future Improvements
- Could map the `InstancedMesh` positions to real Des Moines GIS data for a true "Digital Twin" look.
- Add interaction (mouse hover effects) using `raycast` on the `InstancedMesh` (though this adds some CPU cost).
