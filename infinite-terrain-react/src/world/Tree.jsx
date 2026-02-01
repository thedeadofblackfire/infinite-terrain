import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import { createNoise2D } from 'simplex-noise'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import * as THREE from 'three'
import treeUrl from '../assets/models/tree.glb'
import alphaLeavesUrl from '../assets/textures/alpha_leaves.png'
import noiseTextureURL from '/textures/noiseTexture.png'
import useStore from '../stores/useStore.jsx'
import { mulberry32 } from './utils/randomUtils.js'
import bushesVertexShader from '../shaders/leaves/vertex.glsl'
import bushesFragmentShader from '../shaders/leaves/fragment.glsl'
import trunkVertexShader from '../shaders/trunk/vertex.glsl'
import trunkFragmentShader from '../shaders/trunk/fragment.glsl'

const TREE_BONE_WIND_SEED = 90210
const treeBoneNoise2D = createNoise2D(mulberry32(TREE_BONE_WIND_SEED))

function hashStringTo01(str) {
  // deterministic [0,1)
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

function geometrySignature(geo) {
  // Many GLBs duplicate identical geometries (different uuid per mesh).
  // Group by a lightweight signature so instancing actually batches draw calls.
  const pos = geo.attributes?.position
  const uv = geo.attributes?.uv
  const nor = geo.attributes?.normal
  const idx = geo.index

  const posCount = pos?.count ?? 0
  const uvCount = uv?.count ?? 0
  const norCount = nor?.count ?? 0
  const idxCount = idx?.count ?? 0

  // Sample a few floats to reduce collisions (safe for repeated bush planes)
  const arr = pos?.array
  let sample = ''
  if (arr && arr.length >= 12) {
    const take = 12
    const head = Array.from(arr.slice(0, take)).map((v) => v.toFixed(3)).join(',')
    const tail = Array.from(arr.slice(Math.max(0, arr.length - take), arr.length)).map((v) => v.toFixed(3)).join(',')
    sample = `|${head}|${tail}`
  }

  return `${posCount}_${uvCount}_${norCount}_${idxCount}${sample}`
}

export function Tree(props) {
  const { nodes } = useGLTF(treeUrl)
  const alphaMap = useTexture(alphaLeavesUrl)
  const noiseTexture = useTexture(
    noiseTextureURL,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      return texture
    },
    [noiseTextureURL]
  )
  const grassParameters = useStore((state) => state.grassParameters)
  const treeParameters = useStore((state) => state.treeParameters)
  const treeRef = useRef(null)
  const instancedMeshesRef = useRef({})
  const tmpRef = useRef({
    invRoot: new THREE.Matrix4(),
    local: new THREE.Matrix4(),
  })

  const bushMeshes = useMemo(() => {
    return Object.keys(nodes)
      .filter((key) => key.startsWith('bush_'))
      .map((key) => nodes[key])
      .filter((m) => m && (m.isMesh || m.isSkinnedMesh))
  }, [nodes])

  const bushGroups = useMemo(() => {
    const map = new Map()
    for (const mesh of bushMeshes) {
      const geo = mesh.geometry
      if (!geo) continue
      const id = geometrySignature(geo)
      const group = map.get(id) ?? { id, geometry: geo, meshes: [] }
      group.meshes.push(mesh)
      map.set(id, group)
    }
    return [...map.values()]
  }, [bushMeshes])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const counts = bushGroups.map((g) => g.meshes.length).sort((a, b) => b - a)
    // Helpful sanity check: if you see lots of 1s, the source GLB likely has unique geometries per bush.
    console.info('[Tree] bush instancing batches:', { batches: bushGroups.length, counts })
  }, [bushGroups])

  // Leaves/bush material (CustomShaderMaterial)
  const leavesMaterial = useMemo(() => {
    return new CustomShaderMaterial({
      baseMaterial: THREE.MeshStandardMaterial,
      uniforms: {
        uTime: { value: 0 },
        uWiggleStrength: { value: treeParameters.bushWiggleStrength },
        uWiggleSpeed: { value: treeParameters.bushWiggleSpeed },
        uWorldNoiseScale: { value: treeParameters.bushWorldNoiseScale },
        uUvWiggleScale: { value: treeParameters.bushUvWiggleScale },
        uNoiseTexture: { value: noiseTexture },
        uNoiseMix: { value: treeParameters.bushNoiseMix },

        uFresnelPower: { value: treeParameters.bushFresnelPower },
        uFresnelStrength: { value: treeParameters.bushFresnelStrength },
        uFresnelColor: { value: new THREE.Color(treeParameters.bushFresnelColor) },
      },
      vertexShader: bushesVertexShader,
      fragmentShader: bushesFragmentShader,
      color: new THREE.Color(treeParameters.leavesColor),
      alphaMap: alphaMap,
      // Important: avoid blended transparency for foliage cards (it causes sorting shimmer).
      transparent: false,
      side: THREE.DoubleSide,
      depthWrite: true,

      // Alpha-to-coverage can produce shimmering/bright edges on foliage cards as coverage changes with motion.
      // Prefer stable cutout rendering here.
      alphaToCoverage: false,
      alphaTest: treeParameters.bushAlphaTest,

      // Reduce specular "edge sparkle" on thin cards.
      roughness: 1.0,
      metalness: 0.0,
    })
  }, [
    alphaMap,
    noiseTexture,
    treeParameters.leavesColor,
    treeParameters.bushAlphaTest,
    treeParameters.bushWiggleStrength,
    treeParameters.bushWiggleSpeed,
    treeParameters.bushWorldNoiseScale,
    treeParameters.bushUvWiggleScale,
    treeParameters.bushNoiseMix,
    treeParameters.bushFresnelPower,
    treeParameters.bushFresnelStrength,
    treeParameters.bushFresnelColor,
  ])

  const trunkMaterial = useMemo(() => {
    return new CustomShaderMaterial({
      baseMaterial: THREE.MeshStandardMaterial,
      vertexShader: trunkVertexShader,
      fragmentShader: trunkFragmentShader,
      uniforms: {
        uTrunkColorA: { value: new THREE.Color(treeParameters.trunkColorA ?? '#ffffff') },
        uTrunkColorB: { value: new THREE.Color(treeParameters.trunkColorB ?? '#000000') },
      },
      roughness: 1.0,
      metalness: 0.0,
    })
  }, [treeParameters.trunkColorA, treeParameters.trunkColorB])

  useEffect(() => {
    // Init bone wind params
    nodes.Bone.traverse((object) => {
      if (object.isBone && !object.userData.initialRotation) {
        object.userData.initialRotation = object.rotation.clone()

        const h = hashStringTo01(object.name || `${object.id}`)
        object.userData.windPhase = h * Math.PI * 2
        object.userData.windSeed = h * 100.0
        object.userData.axisMix = 0.35 + h * 0.65
      }
    })

    // Hide bush meshes and use them only as "transform drivers" for instancing
    for (const mesh of bushMeshes) {
      mesh.visible = false
      if (mesh.geometry && !mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere()
      }
    }
  }, [nodes, bushMeshes])

  useFrame((state) => {
    const { windSpeed, windStrength } = grassParameters
    const time = state.clock.elapsedTime

    if (leavesMaterial?.uniforms?.uTime) {
      leavesMaterial.uniforms.uTime.value = time
    }

    const angleMax = treeParameters.boneAngleMax ?? 0.18
    const speedMul = treeParameters.boneSpeedMul ?? 1.0
    const noiseStrength = treeParameters.boneNoiseStrength ?? 0.65
    const noiseScale = treeParameters.boneNoiseScale ?? 0.75
    const noiseSpeed = treeParameters.boneNoiseSpeed ?? 0.35
    const xFactor = treeParameters.boneXFactor ?? 0.55
    const zFactor = treeParameters.boneZFactor ?? 1.0
    const parentInfluence = THREE.MathUtils.clamp(treeParameters.boneParentInfluence ?? 0.65, 0, 1.25)

    nodes.Bone.traverse((object) => {
      if (object.isBone && object.userData.initialRotation) {
        const initial = object.userData.initialRotation

        // Base periodic sway (keeps a consistent "wind direction")
        const base = Math.sin(time * windSpeed * speedMul + (object.userData.windPhase ?? 0)) * windStrength

        // Smooth random modulation (like grass wind, but CPU-side): simplex noise in [-1, 1]
        const n = treeBoneNoise2D(
          (object.userData.windSeed ?? 0) + time * noiseSpeed,
          object.position.y * noiseScale
        )

        // Convert noise to an amplitude multiplier around 1.0
        const amp = THREE.MathUtils.clamp(1.0 + n * noiseStrength, 0.0, 2.5)

        // Final angle with user-controlled max
        const localAngle = base * amp * angleMax

        // Hierarchy influence: let child bones inherit a portion of the parent's applied sway.
        // This controls how strongly the chain "follows" previous bones.
        const parentAngle = object.parent?.isBone ? (object.parent.userData._appliedAngle ?? 0) : 0
        const angle = localAngle + parentAngle * parentInfluence
        object.userData._appliedAngle = angle

        // Slight axis variation per bone
        const axisMix = object.userData.axisMix ?? 1.0
        object.rotation.z = initial.z + angle * zFactor * axisMix
        object.rotation.x = initial.x + angle * xFactor * (1.0 - 0.35 * axisMix)
      }
    })

    // Update instanced bushes to follow the animated skeleton hierarchy
    const root = treeRef.current
    if (!root || bushGroups.length === 0) return

    root.updateMatrixWorld(true)
    nodes.Bone.updateMatrixWorld(true)

    const { invRoot, local } = tmpRef.current
    invRoot.copy(root.matrixWorld).invert()

    for (const group of bushGroups) {
      const inst = instancedMeshesRef.current[group.id]
      if (!inst) continue

      for (let i = 0; i < group.meshes.length; i++) {
        const mesh = group.meshes[i]
        mesh.updateMatrixWorld(true)
        local.multiplyMatrices(invRoot, mesh.matrixWorld)
        inst.setMatrixAt(i, local)
      }

      inst.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group {...props} ref={treeRef} dispose={null} scale={1.5} rotation-y={Math.PI / 2}>
      <skinnedMesh
        geometry={nodes.trunk.geometry}
        material={trunkMaterial}
        skeleton={nodes.trunk.skeleton}
      />
      <primitive object={nodes.Bone} />

      {bushGroups.map((group) => (
        <instancedMesh
          key={group.id}
          args={[group.geometry, leavesMaterial, group.meshes.length]}
          frustumCulled={false}
          ref={(r) => {
            if (r) instancedMeshesRef.current[group.id] = r
          }}
        />
      ))}
    </group>
  )
}

useGLTF.preload(treeUrl)
