"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";

export type PreviewShape = "Suzanne" | "Sculpt" | "Torus";

function Suzanne({ material, wireframe }: { material: THREE.MeshMatcapMaterial; wireframe: boolean }) {
  const { scene } = useGLTF("/models/suzanne.glb");
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((child) => {
      if (child instanceof THREE.Mesh) child.material = material;
    });
    const box = new THREE.Box3().setFromObject(copy);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = 2.75 / Math.max(size.x, size.y, size.z);
    copy.position.copy(center.multiplyScalar(-scale));
    copy.scale.setScalar(scale);
    return copy;
  }, [scene, material]);
  const wireMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#10191b", wireframe: true, transparent: true, opacity: 0.17, depthWrite: false }), []);
  const wireObject = useMemo(() => {
    const copy = object.clone(true);
    copy.scale.multiplyScalar(1.002);
    copy.traverse((child) => { if (child instanceof THREE.Mesh) child.material = wireMaterial; });
    return copy;
  }, [object, wireMaterial]);
  useEffect(() => () => wireMaterial.dispose(), [wireMaterial]);
  return <group rotation={[0.04, -0.13, 0]}><primitive object={object} />{wireframe && <primitive object={wireObject} />}</group>;
}

function SampleMesh({ canvas, shape, wireframe }: { canvas: HTMLCanvasElement; shape: PreviewShape; wireframe: boolean }) {
  const texture = useMemo(() => {
    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = THREE.SRGBColorSpace;
    next.generateMipmaps = true;
    next.minFilter = THREE.LinearMipmapLinearFilter;
    next.magFilter = THREE.LinearFilter;
    next.needsUpdate = true;
    return next;
  }, [canvas]);
  const material = useMemo(() => new THREE.MeshMatcapMaterial({ matcap: texture, color: "white" }), [texture]);
  useEffect(() => () => { material.dispose(); texture.dispose(); }, [material, texture]);
  const geometry = useMemo(() => shape === "Torus" ? new THREE.TorusGeometry(1.06, 0.38, 56, 200) : new THREE.TorusKnotGeometry(1.0, 0.32, 320, 48, 2, 3), [shape]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  if (shape === "Suzanne") return <Suspense fallback={null}><Suzanne material={material} wireframe={wireframe} /></Suspense>;
  return <group rotation={shape === "Sculpt" ? [0.38, -0.28, 0.12] : [0.2, -0.3, 0]}>
    <mesh geometry={geometry} material={material} />
    {wireframe && <mesh geometry={geometry} scale={1.002}><meshBasicMaterial color="#0c1419" wireframe transparent opacity={0.2} depthWrite={false} /></mesh>}
  </group>;
}

export default function Preview({ canvas, shape, wireframe }: { canvas: HTMLCanvasElement; shape: PreviewShape; wireframe: boolean }) {
  return (
    <Canvas camera={{ position: [2.9, 1.65, 5.1], fov: 39, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}>
      <SampleMesh canvas={canvas} shape={shape} wireframe={wireframe} />
      <OrbitControls makeDefault enablePan={false} minDistance={3.2} maxDistance={9} enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}

useGLTF.preload("/models/suzanne.glb");
