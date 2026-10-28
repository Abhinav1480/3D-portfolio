import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import { PALETTE } from '../config/palette';

interface TreeClusterProps {
  position: [number, number, number];
  scale?: number;
  potColor: string;
  leafCount?: number;
  seed?: number;
  reducedMotion: boolean;
  ignoreVisibilityRay?: boolean;
}

interface BranchSpec {
  curve: THREE.CatmullRomCurve3;
  radiusBottom: number;
  radiusTop: number;
  tip: THREE.Vector3;
  mid: THREE.Vector3;
  angle: number;
}

interface FoliagePuffSpec {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  tone: 'dark' | 'mid' | 'light' | 'highlight';
}

interface SculptedLeafSpec {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  tone: 'dark' | 'mid' | 'light' | 'highlight';
}

interface PebbleSpec {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
}

/**
 * Builds a tapered 3D tube geometry along a 3D CatmullRomCurve3 so trunks and branches
 * taper naturally from base to tip in full 3D space.
 */
function createTaperedBranchGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegments: number,
  radiusBottom: number,
  radiusTop: number,
  radialSegments = 10
): THREE.BufferGeometry {
  const geo = new THREE.TubeGeometry(curve, tubularSegments, 1, radialSegments, false);
  const pos = geo.attributes.position;
  const ringStride = radialSegments + 1;

  const centerPt = new THREE.Vector3();
  const vertPt = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, centerPt);
    // Smooth natural taper with slight root flare near t = 0
    const rootFlare = t < 0.15 ? (1 - t / 0.15) * 0.22 * radiusBottom : 0;
    const r = THREE.MathUtils.lerp(radiusBottom, radiusTop, Math.pow(t, 0.85)) + rootFlare;

    for (let j = 0; j < ringStride; j++) {
      const idx = i * ringStride + j;
      vertPt.fromBufferAttribute(pos, idx);
      vertPt.sub(centerPt).multiplyScalar(r).add(centerPt);
      pos.setXYZ(idx, vertPt.x, vertPt.y, vertPt.z);
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates an organic, softly sculpted 3D foliage cluster geometry (displaced icosahedron)
 * so tree crowns have lush 3D volume from every viewing angle.
 */
function createOrganicFoliageClusterGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * 4.2 + v.y * 3.1) * 0.08 +
      Math.cos(v.z * 4.5 - v.x * 2.7) * 0.07 +
      Math.sin(v.y * 5.3 + v.z * 3.8) * 0.06;
    // Slightly flatten bottom and puff top for realistic tree crown silhouette
    const yFactor = v.y < 0 ? 0.86 : 1.04;
    v.multiplyScalar(1 + n);
    v.y *= yFactor;
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a true 3D sculpted botanical leaf geometry with a pointed tip, rounded lobes,
 * bevelled 3D thickness, and natural longitudinal arch.
 */
function createSculpted3DLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  // Left lobe of fiddle/ficus leaf
  shape.bezierCurveTo(-0.24, 0.12, -0.38, 0.38, -0.28, 0.62);
  shape.bezierCurveTo(-0.22, 0.78, -0.32, 0.96, -0.18, 1.16);
  shape.bezierCurveTo(-0.09, 1.28, -0.03, 1.35, 0, 1.4);
  // Right lobe of fiddle/ficus leaf
  shape.bezierCurveTo(0.03, 1.35, 0.09, 1.28, 0.18, 1.16);
  shape.bezierCurveTo(0.32, 0.96, 0.22, 0.78, 0.28, 0.62);
  shape.bezierCurveTo(0.38, 0.38, 0.24, 0.12, 0, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 4,
    depth: 0.028,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 14,
  });

  // Center thickness around Z = 0 and add natural 3D leaf arch + cup curvature
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const normY = THREE.MathUtils.clamp(v.y / 1.4, 0, 1);
    const normX = v.x / 0.36;
    // Droop curve along length (Y) and subtle V-cup along width (X)
    const droopZ = Math.sin(normY * Math.PI) * 0.09 - Math.pow(normY, 2.1) * 0.11;
    const cupZ = Math.pow(Math.abs(normX), 1.6) * 0.035;
    v.z = v.z - 0.014 + droopZ + cupZ;
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

const Potted3DTree: React.FC<TreeClusterProps> = ({
  position,
  scale = 1,
  potColor,
  leafCount = 10,
  seed = 101,
  reducedMotion,
  ignoreVisibilityRay = false,
}) => {
  const groupRef = useRef<THREE.Group | null>(null);
  const timeUniform = useMemo(() => ({ value: 0 }), []);

  const attachSwayShader = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = `uniform float uTime;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float swayMask = clamp((position.y - 0.22) * 1.8, 0.0, 1.0);
      transformed.x += sin(uTime * 1.5 + position.z * 4.5 + position.y * 2.0) * 0.011 * swayMask;
      transformed.z += cos(uTime * 1.25 + position.x * 4.5 + position.y * 2.0) * 0.009 * swayMask;
      `
    );
  };

  useFrame((_, delta) => {
    if (!reducedMotion) {
      timeUniform.value += Math.min(delta, 0.05);
    }
  });

  const handlePlantClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (!groupRef.current) return;
    gsap.fromTo(
      groupRef.current.rotation,
      { z: 0.08 },
      { z: 0, duration: 0.55, ease: 'elastic.out(1, 0.3)' }
    );
  };

  // Derived multi-tone 3D foliage and bark colors from the approved PALETTE
  const colors = useMemo(() => {
    const dark = new THREE.Color(PALETTE.plantLeafDark);
    const light = new THREE.Color(PALETTE.plantLeafLight);
    const mid = dark.clone().lerp(light, 0.52);
    const highlight = light.clone().offsetHSL(-0.01, 0.05, 0.06);
    const barkMain = new THREE.Color(PALETTE.wallCapFront);
    const barkDark = new THREE.Color(PALETTE.plantSoil).lerp(barkMain, 0.45);
    const pebbleA = new THREE.Color(PALETTE.wallEdge);
    const pebbleB = new THREE.Color(PALETTE.frameSketch);

    return {
      dark: `#${dark.getHexString()}`,
      mid: `#${mid.getHexString()}`,
      light: `#${light.getHexString()}`,
      highlight: `#${highlight.getHexString()}`,
      barkMain: `#${barkMain.getHexString()}`,
      barkDark: `#${barkDark.getHexString()}`,
      pebbleA: `#${pebbleA.getHexString()}`,
      pebbleB: `#${pebbleB.getHexString()}`,
    };
  }, []);

  // Shared procedural 3D geometries for this tree instance
  const {
    trunkGeo,
    branchGeos,
    foliageClusterGeo,
    leafBladeGeo,
    foliagePuffs,
    sculptedLeaves,
    pebbles,
  } = useMemo(() => {
    let s = seed;
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };

    // 1. Curved 3D main trunk from soil (y = 0.23) up to crown apex (y = 0.58)
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.22, 0),
      new THREE.Vector3((rand() - 0.5) * 0.025, 0.32, (rand() - 0.5) * 0.025),
      new THREE.Vector3((rand() - 0.5) * 0.032, 0.44, (rand() - 0.5) * 0.032),
      new THREE.Vector3((rand() - 0.5) * 0.018, 0.56, (rand() - 0.5) * 0.018),
    ]);
    const mainTrunkGeo = createTaperedBranchGeometry(trunkCurve, 20, 0.034, 0.012, 12);

    // 2. 3D secondary branches radiating out at golden-angle intervals and tiered heights
    const branchCount = Math.max(4, Math.min(7, Math.round(leafCount * 0.55)));
    const branches: BranchSpec[] = [];
    const createdBranchGeos: THREE.BufferGeometry[] = [];

    for (let i = 0; i < branchCount; i++) {
      const tTier = i / Math.max(1, branchCount - 1);
      const startT = 0.28 + tTier * 0.58;
      const startPt = trunkCurve.getPointAt(startT);
      const angle = i * 2.39996 + (rand() - 0.5) * 0.28; // Golden angle distribution in 3D
      const reach = 0.095 + (1 - tTier * 0.35) * 0.055 + rand() * 0.02;
      const rise = 0.075 + tTier * 0.045 + rand() * 0.025;

      const midPt = new THREE.Vector3(
        startPt.x + Math.cos(angle) * reach * 0.55,
        startPt.y + rise * 0.48,
        startPt.z + Math.sin(angle) * reach * 0.55
      );
      const tipPt = new THREE.Vector3(
        startPt.x + Math.cos(angle) * reach,
        startPt.y + rise,
        startPt.z + Math.sin(angle) * reach
      );

      const bCurve = new THREE.CatmullRomCurve3([startPt, midPt, tipPt]);
      const rBot = 0.016 - tTier * 0.004;
      const rTop = 0.0055;
      createdBranchGeos.push(createTaperedBranchGeometry(bCurve, 12, rBot, rTop, 8));
      branches.push({
        curve: bCurve,
        radiusBottom: rBot,
        radiusTop: rTop,
        tip: tipPt,
        mid: midPt,
        angle,
      });
    }

    // 3. Volumetric 3D canopy clusters (multi-layered 3D foliage puffs around branch tips & crown)
    const puffs: FoliagePuffSpec[] = [];
    const tones: Array<'dark' | 'mid' | 'light' | 'highlight'> = [
      'dark',
      'mid',
      'light',
      'highlight',
    ];

    // Central upper crown puffs
    const apex = trunkCurve.getPointAt(1);
    puffs.push({
      position: [apex.x, apex.y + 0.055, apex.z],
      scale: [0.115, 0.095, 0.115],
      rotation: [rand() * 0.5, rand() * Math.PI, rand() * 0.5],
      tone: 'highlight',
    });
    puffs.push({
      position: [apex.x + 0.025, apex.y + 0.015, apex.z - 0.02],
      scale: [0.125, 0.092, 0.12],
      rotation: [rand() * 0.6, rand() * Math.PI, rand() * 0.6],
      tone: 'light',
    });

    // Branch-tip and mid-branch 3D foliage clouds
    branches.forEach((b, idx) => {
      const mainTone = tones[idx % tones.length];
      const subTone = tones[(idx + 1) % tones.length];

      // Primary cluster at branch tip
      puffs.push({
        position: [b.tip.x, b.tip.y + 0.018, b.tip.z],
        scale: [
          0.095 + rand() * 0.022,
          0.074 + rand() * 0.018,
          0.095 + rand() * 0.022,
        ],
        rotation: [rand() * 0.8, b.angle, rand() * 0.8],
        tone: mainTone,
      });

      // Secondary overlapping sub-cluster for rich 3D silhouette
      const sideAngle = b.angle + (idx % 2 === 0 ? 0.55 : -0.55);
      puffs.push({
        position: [
          b.mid.x + Math.cos(sideAngle) * 0.035,
          b.mid.y + 0.028,
          b.mid.z + Math.sin(sideAngle) * 0.035,
        ],
        scale: [
          0.076 + rand() * 0.018,
          0.062 + rand() * 0.014,
          0.076 + rand() * 0.018,
        ],
        rotation: [rand() * 0.8, sideAngle, rand() * 0.8],
        tone: subTone,
      });
    });

    // 4. Individual sculpted 3D leaves emerging around the 3D canopy & branch nodes
    const leaves: SculptedLeafSpec[] = [];
    const totalLeaves = Math.max(14, leafCount * 2);
    for (let i = 0; i < totalLeaves; i++) {
      const b = branches[i % branches.length];
      const isTip = i < branches.length * 2;
      const anchor = isTip ? b.tip : b.mid;
      const leafYaw = b.angle + ((i % 3) - 1) * 0.62 + (rand() - 0.5) * 0.25;
      const leafPitch = 0.52 + (i % 3) * 0.22 + (rand() - 0.5) * 0.12;
      const leafRoll = (rand() - 0.5) * 0.36;
      const leafScale = 0.095 + (1 - (i / totalLeaves) * 0.35) * 0.045;

      leaves.push({
        position: [
          anchor.x + Math.cos(leafYaw) * 0.022,
          anchor.y + 0.008 + (i % 2) * 0.016,
          anchor.z + Math.sin(leafYaw) * 0.022,
        ],
        rotation: [leafPitch, leafYaw - Math.PI / 2, leafRoll],
        scale: leafScale,
        tone: tones[i % tones.length],
      });
    }

    // Top crown rosette of sculpted 3D leaves
    for (let k = 0; k < 5; k++) {
      const crownYaw = (k * Math.PI * 2) / 5 + 0.3;
      leaves.push({
        position: [
          apex.x + Math.cos(crownYaw) * 0.018,
          apex.y + 0.055,
          apex.z + Math.sin(crownYaw) * 0.018,
        ],
        rotation: [0.42 + (k % 2) * 0.14, crownYaw - Math.PI / 2, (k % 2 === 0 ? 1 : -1) * 0.15],
        scale: 0.105,
        tone: k % 2 === 0 ? 'highlight' : 'light',
      });
    }

    // 5. Small 3D river pebbles resting on the contoured soil mound
    const soilPebbles: PebbleSpec[] = [];
    for (let p = 0; p < 7; p++) {
      const pAngle = p * 1.15 + rand() * 0.4;
      const pDist = 0.048 + rand() * 0.058;
      soilPebbles.push({
        position: [
          Math.cos(pAngle) * pDist,
          0.246 - pDist * 0.05,
          Math.sin(pAngle) * pDist,
        ],
        scale: [
          0.016 + rand() * 0.01,
          0.009 + rand() * 0.005,
          0.014 + rand() * 0.009,
        ],
        rotation: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
      });
    }

    return {
      trunkGeo: mainTrunkGeo,
      branchGeos: createdBranchGeos,
      foliageClusterGeo: createOrganicFoliageClusterGeometry(),
      leafBladeGeo: createSculpted3DLeafGeometry(),
      foliagePuffs: puffs,
      sculptedLeaves: leaves,
      pebbles: soilPebbles,
    };
  }, [leafCount, seed]);

  useEffect(() => {
    return () => {
      trunkGeo.dispose();
      branchGeos.forEach((g) => g.dispose());
      foliageClusterGeo.dispose();
      leafBladeGeo.dispose();
    };
  }, [trunkGeo, branchGeos, foliageClusterGeo, leafBladeGeo]);

  const rayUserData = useMemo(
    () => (ignoreVisibilityRay ? { ignoreVisibilityRay: true } : undefined),
    [ignoreVisibilityRay]
  );

  return (
    <group
      ref={groupRef}
      position={position}
      scale={[scale, scale, scale]}
      onClick={handlePlantClick}
      userData={rayUserData}
    >
      {/* Ceramic Saucer / Base Plate */}
      <mesh
        position={[0, 0.014, 0]}
        castShadow
        receiveShadow
        userData={rayUserData}
      >
        <cylinderGeometry args={[0.122, 0.114, 0.028, 24]} />
        <meshStandardMaterial color={potColor} roughness={0.62} />
      </mesh>

      {/* Main Tapered Planter Pot Body */}
      <mesh
        position={[0, 0.135, 0]}
        castShadow
        receiveShadow
        userData={rayUserData}
      >
        <cylinderGeometry args={[0.142, 0.106, 0.245, 28]} />
        <meshStandardMaterial color={potColor} roughness={0.66} />
      </mesh>

      {/* Upper Bevelled Pot Collar & Rounded Rim Lip */}
      <mesh
        position={[0, 0.252, 0]}
        castShadow
        receiveShadow
        userData={rayUserData}
      >
        <cylinderGeometry args={[0.152, 0.145, 0.032, 28]} />
        <meshStandardMaterial color={potColor} roughness={0.64} />
      </mesh>
      <mesh
        position={[0, 0.266, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        userData={rayUserData}
      >
        <torusGeometry args={[0.142, 0.01, 12, 28]} />
        <meshStandardMaterial color={potColor} roughness={0.62} />
      </mesh>

      {/* Contoured 3D Soil Mound Dome */}
      <mesh
        position={[0, 0.238, 0]}
        scale={[1, 0.22, 1]}
        receiveShadow
        userData={rayUserData}
      >
        <sphereGeometry args={[0.134, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={PALETTE.plantSoil} roughness={0.92} />
      </mesh>

      {/* 3D Decorative River Pebbles on Soil */}
      {pebbles.map((peb, idx) => (
        <mesh
          key={`peb-${idx}`}
          position={peb.position}
          scale={peb.scale}
          rotation={peb.rotation}
          castShadow
          receiveShadow
          userData={rayUserData}
        >
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color={idx % 2 === 0 ? colors.pebbleA : colors.pebbleB}
            roughness={0.78}
          />
        </mesh>
      ))}

      {/* Sculpted Root Flare Collar at Base of Trunk */}
      <mesh
        position={[0, 0.255, 0]}
        castShadow
        receiveShadow
        userData={rayUserData}
      >
        <cylinderGeometry args={[0.026, 0.044, 0.055, 14]} />
        <meshStandardMaterial color={colors.barkDark} roughness={0.86} />
      </mesh>

      {/* Curved 3D Woody Main Trunk */}
      <mesh
        geometry={trunkGeo}
        castShadow
        receiveShadow
        userData={rayUserData}
      >
        <meshStandardMaterial color={colors.barkMain} roughness={0.84} />
      </mesh>

      {/* Curved 3D Secondary Woody Branches */}
      {branchGeos.map((bGeo, idx) => (
        <mesh
          key={`branch-${idx}`}
          geometry={bGeo}
          castShadow
          receiveShadow
          userData={rayUserData}
        >
          <meshStandardMaterial
            color={idx % 2 === 0 ? colors.barkMain : colors.barkDark}
            roughness={0.82}
          />
        </mesh>
      ))}

      {/* Multi-Layered Volumetric 3D Foliage Canopy Clusters */}
      {foliagePuffs.map((puff, idx) => (
        <mesh
          key={`puff-${idx}`}
          geometry={foliageClusterGeo}
          position={puff.position}
          scale={puff.scale}
          rotation={puff.rotation}
          castShadow
          receiveShadow
          userData={rayUserData}
        >
          <meshStandardMaterial
            color={colors[puff.tone]}
            roughness={puff.tone === 'highlight' ? 0.58 : 0.68}
            onBeforeCompile={attachSwayShader}
          />
        </mesh>
      ))}

      {/* Individual Sculpted 3D Botanical Leaves with Midrib Stems */}
      {sculptedLeaves.map((leaf, idx) => (
        <group
          key={`leaf-${idx}`}
          position={leaf.position}
          rotation={leaf.rotation}
          scale={[leaf.scale, leaf.scale, leaf.scale]}
          userData={rayUserData}
        >
          <mesh
            geometry={leafBladeGeo}
            castShadow
            receiveShadow
            userData={rayUserData}
          >
            <meshStandardMaterial
              color={colors[leaf.tone]}
              roughness={0.62}
              onBeforeCompile={attachSwayShader}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};

export const Plants: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  return (
    <group name="RoomPlants">
      {/* Floor tree at (0.68, 0, -2.68), 0.65 m below the wall-hung acoustic guitar and clear of the bookshelf */}
      <Potted3DTree
        position={[0.68, 0, -2.68]}
        scale={1.0}
        potColor={PALETTE.potCream}
        leafCount={10}
        seed={101}
        reducedMotion={reducedMotion}
      />

      {/* Floor tree positioned down under the floating shelf near the small floor tree */}
      <Potted3DTree
        position={[1.36, 0, -2.66]}
        scale={1.32}
        potColor={PALETTE.potTerracotta}
        leafCount={14}
        seed={202}
        reducedMotion={reducedMotion}
      />

      {/* Tree on the left of the sofa (-2.95, 0, 2.52) */}
      <Potted3DTree
        position={[-2.95, 0, 2.52]}
        scale={1.08}
        potColor={PALETTE.potOrange}
        leafCount={11}
        seed={303}
        reducedMotion={reducedMotion}
      />

      {/* Coffee-table mini bonsai tree at back-left (-1.66, 0.4225, 1.22) so it never blocks the phone */}
      <Potted3DTree
        position={[-1.66, 0.4225, 1.22]}
        scale={0.38}
        potColor={PALETTE.potCream}
        leafCount={8}
        seed={404}
        reducedMotion={reducedMotion}
        ignoreVisibilityRay
      />
    </group>
  );
};
