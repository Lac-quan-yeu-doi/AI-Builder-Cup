'use client';

import { Line, OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';

import type { EquipmentKind } from '@/src/entities/models/plant-walkthrough';
import type {
  TwinFlow,
  TwinMachine,
  TwinScene,
  TwinZone,
} from '@/src/entities/models/plant-twin-scene';

import { readTwinPalette, type TwinPalette } from './use-twin-palette';

/*
 * Isometric view of the plant model. An orthographic camera at the classic
 * iso angle; the viewer may turn around the plant and zoom, never tip it
 * over. Every shape is a primitive, so a plant of any size renders without
 * assets, and the colours carry meaning: the light on each machine is the
 * state Gemini saw, and a dashed flow is one it had to assume.
 */

const ISO_POLAR = Math.atan(Math.SQRT2); // 54.7°, from straight down.

/** A DOM label pinned to a point in the scene. */
export interface LabelAnchor {
  readonly id: string;
  readonly position: readonly [number, number, number];
}

interface TwinCanvasProps {
  readonly scene: TwinScene;
  readonly selectedId?: string;
  readonly onSelect: (id: string | undefined) => void;
  /** Label elements by anchor id, positioned by the canvas every frame. */
  readonly labels: RefObject<Map<string, HTMLElement>>;
}

export function TwinCanvas({ scene, selectedId, onSelect, labels }: TwinCanvasProps) {
  // This module only loads in the browser (see twin-view), so the tokens can be read directly.
  const palette = useMemo(() => readTwinPalette(), []);
  const anchors = useMemo(() => labelAnchors(scene), [scene]);
  const heightOf = useMemo(
    () => new Map(scene.machines.map((machine) => [machine.id, SIZE[machine.kind][1]])),
    [scene.machines],
  );
  const centre = useMemo(
    () =>
      new THREE.Vector3(
        (scene.bounds.minX + scene.bounds.maxX) / 2,
        0,
        (scene.bounds.minZ + scene.bounds.maxZ) / 2,
      ),
    [scene.bounds],
  );
  const related = useMemo(() => {
    if (selectedId === undefined) return new Set<string>();
    return new Set(
      scene.flows
        .filter((flow) => flow.fromId === selectedId || flow.toId === selectedId)
        .map((flow) => flow.id),
    );
  }, [scene.flows, selectedId]);

  return (
    <Canvas
      flat
      shadows
      dpr={[1, 2]}
      onPointerMissed={() => onSelect(undefined)}
      gl={{ antialias: true, alpha: true }}
    >
      <OrthographicCamera
        makeDefault
        position={[centre.x + 40, 40, centre.z + 40]}
        zoom={40}
        near={0.1}
        far={500}
      />
      <FitCamera scene={scene} centre={centre} />
      <OrbitControls
        makeDefault
        target={centre}
        minPolarAngle={ISO_POLAR - 0.25}
        maxPolarAngle={ISO_POLAR + 0.15}
        minZoom={12}
        maxZoom={160}
        enableDamping
      />
      <ambientLight intensity={1.6} />
      <directionalLight
        position={[centre.x + 12, 22, centre.z + 6]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />

      {/* The floor is the container's own background; this plane only catches shadows. */}
      <mesh rotation-x={-Math.PI / 2} position={[centre.x, -0.02, centre.z]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <shadowMaterial opacity={0.12} />
      </mesh>

      <group>
        {scene.zones.map((zone) => (
          <Zone key={zone.id} zone={zone} palette={palette} />
        ))}
        {scene.machines.map((machine) => (
          <Machine
            key={machine.id}
            machine={machine}
            selected={machine.id === selectedId}
            dimmed={selectedId !== undefined && machine.id !== selectedId}
            onSelect={onSelect}
            palette={palette}
          />
        ))}
      </group>

      <LabelProjector anchors={anchors} labels={labels} />

      {scene.flows.map((flow) => (
        <Flow
          key={flow.id}
          flow={flow}
          fromHeight={heightOf.get(flow.fromId) ?? 1}
          toHeight={heightOf.get(flow.toId) ?? 1}
          highlighted={related.has(flow.id)}
          dimmed={selectedId !== undefined && !related.has(flow.id)}
          palette={palette}
        />
      ))}
    </Canvas>
  );
}

function Zone({ zone, palette }: { readonly zone: TwinZone; readonly palette: TwinPalette }) {
  const width = zone.maxX - zone.minX;
  const depth = zone.maxZ - zone.minZ;
  const area = zone.kind === 'area';
  const height = area ? 0.04 : 0.08;
  return (
    <group position={[zone.minX + width / 2, 0, zone.minZ + depth / 2]}>
      <mesh position-y={height / 2 + (area ? 0 : 0.04)} receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={area ? palette.area : palette.line} />
      </mesh>
    </group>
  );
}

/*
 * Frames the plant once per scene or canvas size: looks at its centre from
 * the iso direction and picks the zoom at which the projected footprint fills
 * the canvas. The viewer's own turning and zooming then take over.
 */
function FitCamera({
  scene,
  centre,
}: {
  readonly scene: TwinScene;
  readonly centre: THREE.Vector3;
}) {
  const get = useThree((state) => state.get);
  const size = useThree((state) => state.size);

  useEffect(() => {
    const { camera } = get();
    const controls = get().controls as unknown as {
      target: THREE.Vector3;
      update: () => void;
    } | null;
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const direction = new THREE.Vector3(1, 1, 1).normalize();
    camera.position.copy(centre).addScaledVector(direction, 60);
    camera.up.set(0, 1, 0);
    camera.lookAt(centre);
    camera.updateMatrixWorld();

    const right = new THREE.Vector3(1, 0, -1).normalize();
    const up = new THREE.Vector3(-1, 2, -1).normalize();
    const { minX, maxX, minZ, maxZ } = scene.bounds;
    let left = Infinity,
      rightMost = -Infinity,
      bottom = Infinity,
      top = -Infinity;
    for (const x of [minX, maxX]) {
      for (const z of [minZ, maxZ]) {
        for (const y of [0, 2.6]) {
          const corner = new THREE.Vector3(x, y, z).sub(centre);
          left = Math.min(left, corner.dot(right));
          rightMost = Math.max(rightMost, corner.dot(right));
          bottom = Math.min(bottom, corner.dot(up));
          top = Math.max(top, corner.dot(up));
        }
      }
    }
    const margin = 1.08;
    camera.zoom = Math.min(
      size.width / ((rightMost - left) * margin),
      size.height / ((top - bottom) * margin),
    );
    // Centre the footprint, not the box: shift by the projected midpoint.
    const shift = right
      .clone()
      .multiplyScalar((left + rightMost) / 2)
      .add(up.clone().multiplyScalar((bottom + top) / 2));
    camera.position.add(shift);
    camera.updateProjectionMatrix();
    if (controls !== null) {
      controls.target.copy(centre).add(shift);
      controls.update();
    }
  }, [get, centre, scene.bounds, size.height, size.width]);

  return null;
}

/*
 * drei's <Html> mounts a React root per label, which React 19 warns about
 * whenever one unmounts mid-render. These labels are ordinary DOM owned by
 * the parent; each frame only writes their transform, so nothing re-renders.
 */
function LabelProjector({
  anchors,
  labels,
}: {
  readonly anchors: readonly LabelAnchor[];
  readonly labels: RefObject<Map<string, HTMLElement>>;
}) {
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const anchor of anchors) {
      const element = labels.current.get(anchor.id);
      if (element === undefined) continue;
      point.set(...anchor.position).project(camera);
      const x = ((point.x + 1) / 2) * size.width;
      const y = ((1 - point.y) / 2) * size.height;
      element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      element.style.visibility = point.z > 1 ? 'hidden' : 'visible';
    }
  });
  return null;
}

/** Machine labels float above the body; area labels sit just inside the area's right corner. */
export function labelAnchors(scene: TwinScene): LabelAnchor[] {
  return [
    ...scene.machines.map((machine) => ({
      id: machine.id,
      position: [machine.x, SIZE[machine.kind][1] + 0.7, machine.z] as const,
    })),
    // Only areas are labelled, just inside their right corner, where no machine
    // stands. A line shows as its own strip; its name is in the machine panel.
    ...scene.zones
      .filter((zone) => zone.kind === 'area')
      .map((zone) => ({ id: zone.id, position: [zone.maxX, 0.1, zone.minZ] as const })),
  ];
}

const SIZE: Record<EquipmentKind, [number, number, number]> = {
  machine: [1.7, 1.5, 1.5],
  conveyor: [2.3, 0.45, 0.8],
  station: [1.6, 0.9, 1.0],
  storage: [1.4, 1.1, 1.2],
  inspection: [1.3, 1.0, 1.0],
  utility: [1.1, 1.8, 1.1],
};

function Machine({
  machine,
  selected,
  dimmed,
  onSelect,
  palette,
}: {
  readonly machine: TwinMachine;
  readonly selected: boolean;
  readonly dimmed: boolean;
  readonly onSelect: (id: string) => void;
  readonly palette: TwinPalette;
}) {
  const [hovered, setHovered] = useState(false);
  const [w, h, d] = SIZE[machine.kind];
  const light = useRef<THREE.Mesh>(null);
  const tint = selected ? palette.selected : hovered ? palette.hover : undefined;

  useFrame(({ clock }) => {
    if (light.current === null || machine.state !== 'running') return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.18;
    light.current.scale.setScalar(pulse);
  });

  return (
    <group
      position={[machine.x, 0.08, machine.z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(machine.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = '';
      }}
    >
      <Body kind={machine.kind} size={[w, h, d]} tint={tint} dimmed={dimmed} palette={palette} />
      <mesh ref={light} position={[w / 2 - 0.25, h + 0.16, d / 2 - 0.25]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial
          color={palette.state[machine.state]}
          emissive={palette.state[machine.state]}
          emissiveIntensity={machine.state === 'running' ? 0.9 : 0.35}
        />
      </mesh>
    </group>
  );
}

function Body({
  kind,
  size: [w, h, d],
  tint,
  dimmed,
  palette,
}: {
  readonly kind: EquipmentKind;
  readonly size: [number, number, number];
  readonly tint?: THREE.Color;
  readonly dimmed: boolean;
  readonly palette: TwinPalette;
}) {
  const body = palette.body[kind];
  const material = (color: THREE.Color) => (
    <meshStandardMaterial
      color={tint ?? color}
      transparent={dimmed}
      opacity={dimmed ? 0.45 : 1}
      roughness={0.7}
    />
  );

  if (kind === 'utility') {
    return (
      <mesh position-y={h / 2} castShadow>
        <cylinderGeometry args={[w / 2, w / 2, h, 24]} />
        {material(body)}
      </mesh>
    );
  }
  if (kind === 'station' || kind === 'inspection') {
    // A table: top on four legs, with a lit panel for inspection.
    return (
      <group>
        <mesh position-y={h - 0.06} castShadow>
          <boxGeometry args={[w, 0.12, d]} />
          {material(body)}
        </mesh>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh
              key={`${sx}${sz}`}
              position={[(sx * (w - 0.16)) / 2, (h - 0.12) / 2, (sz * (d - 0.16)) / 2]}
              castShadow
            >
              <boxGeometry args={[0.08, h - 0.12, 0.08]} />
              {material(palette.trim)}
            </mesh>
          )),
        )}
        {kind === 'inspection' && (
          <mesh position={[0, h + 0.4, -d / 2 + 0.1]} castShadow>
            <boxGeometry args={[w * 0.7, 0.7, 0.06]} />
            <meshStandardMaterial
              color={tint ?? palette.glow}
              emissive={palette.glow}
              emissiveIntensity={0.4}
            />
          </mesh>
        )}
      </group>
    );
  }
  if (kind === 'storage') {
    // Stacked crates.
    return (
      <group>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * 0.1, 0.18 + i * 0.36, (i % 2) * 0.08]} castShadow>
            <boxGeometry args={[w - i * 0.15, 0.34, d - i * 0.15]} />
            {material(i % 2 === 0 ? body : body.clone().multiplyScalar(0.9))}
          </mesh>
        ))}
      </group>
    );
  }
  if (kind === 'conveyor') {
    return (
      <group>
        <mesh position-y={h / 2} castShadow>
          <boxGeometry args={[w, h, d]} />
          {material(body)}
        </mesh>
        <mesh position-y={h + 0.01}>
          <boxGeometry args={[w - 0.1, 0.02, d - 0.2]} />
          <meshStandardMaterial color={tint ?? palette.trim} />
        </mesh>
      </group>
    );
  }
  // A machine: body, darker top, a front panel.
  return (
    <group>
      <mesh position-y={h / 2} castShadow>
        <boxGeometry args={[w, h, d]} />
        {material(body)}
      </mesh>
      <mesh position-y={h + 0.04} castShadow>
        <boxGeometry args={[w * 0.92, 0.08, d * 0.92]} />
        {material(body.clone().multiplyScalar(0.88))}
      </mesh>
      <mesh position={[-w / 4, h * 0.55, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.35, h * 0.35]} />
        <meshStandardMaterial color={tint ?? palette.trim} />
      </mesh>
    </group>
  );
}

function Flow({
  flow,
  fromHeight,
  toHeight,
  highlighted,
  dimmed,
  palette,
}: {
  readonly flow: TwinFlow;
  readonly fromHeight: number;
  readonly toHeight: number;
  readonly highlighted: boolean;
  readonly dimmed: boolean;
  readonly palette: TwinPalette;
}) {
  const curve = useMemo(() => {
    // Leaves the top of one machine and lands on the top of the next.
    const from = new THREE.Vector3(flow.from[0], fromHeight + 0.1, flow.from[1]);
    const to = new THREE.Vector3(flow.to[0], toHeight + 0.1, flow.to[1]);
    const lift = Math.min(2.5, 0.8 + from.distanceTo(to) * 0.12);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.setY(Math.max(from.y, to.y) + lift);
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  }, [flow.from, flow.to, fromHeight, toHeight]);
  const points = useMemo(() => curve.getPoints(40), [curve]);
  const dots = useRef<(THREE.Mesh | null)[]>([]);
  const color = highlighted ? palette.selected : palette.flow;

  useFrame(({ clock }) => {
    dots.current.forEach((dot, index) => {
      if (dot === null) return;
      const t = (clock.elapsedTime * 0.25 + index / 3) % 1;
      dot.position.copy(curve.getPoint(t));
    });
  });

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={highlighted ? 3 : 2}
        dashed={flow.inferred}
        dashSize={0.35}
        gapSize={0.25}
        transparent
        opacity={dimmed ? 0.2 : 0.85}
      />
      {!flow.inferred &&
        [0, 1, 2].map((index) => (
          <mesh
            key={index}
            ref={(mesh) => {
              dots.current[index] = mesh;
            }}
          >
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={color} transparent opacity={dimmed ? 0.2 : 1} />
          </mesh>
        ))}
    </group>
  );
}
