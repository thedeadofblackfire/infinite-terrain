import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedRigidBodies } from '@react-three/rapier'
import { createNoise2D } from 'simplex-noise'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'
import useStore from '../stores/useStore.jsx'
import { mulberry32 } from './utils/randomUtils.js'
import { TreeLeaves } from './TreeLeaves.jsx'
import trunkData from './data/trunks.json'

const TREE_BONE_WIND_SEED = 90210
const treeBoneNoise2D = createNoise2D(mulberry32(TREE_BONE_WIND_SEED))
const TRUNK_ENTRIES = Object.entries(trunkData)
const TRUNK_NAMES = TRUNK_ENTRIES.map(([name]) => name)
const TRUNK_NAME_SET = new Set(TRUNK_NAMES)

function hashStringTo01(str) {
    // deterministic [0,1)
    let h = 2166136261
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return ((h >>> 0) % 100000) / 100000
}

export function Tree(props) {
    if (!props.treeScene) return null

    const clonedScene = useMemo(() => {
        if (!props.treeScene) return null
        return SkeletonUtils.clone(props.treeScene)
    }, [props.treeScene])

    if (!clonedScene) return null
    const nodes = useMemo(() => {
        const nodes = {}
        clonedScene.traverse((obj) => {
            if (obj.name) nodes[obj.name] = obj
        })
        return nodes
    }, [clonedScene])
    const windParameters = useStore((state) => state.windParameters)
    const treeParameters = useStore((state) => state.treeParameters)
    const innerRef = useRef(null)
    const windTmpRef = useRef({
        quat: new THREE.Quaternion(),
        invQuat: new THREE.Quaternion(),
        vec: new THREE.Vector3(),
    })
    const trunkBodiesRef = useRef(null)
    const trunkTmpRef = useRef({
        pos: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
    })

    const boneRoot = useMemo(() => {
        if (nodes?.Bone?.isBone) return nodes.Bone
        const skeleton = nodes?.trunk?.skeleton
        if (skeleton?.bones?.length) {
            const boneSet = new Set(skeleton.bones)
            const rootBone = skeleton.bones.find((bone) => !bone.parent || !boneSet.has(bone.parent))
            return rootBone ?? skeleton.bones[0]
        }
        let found = null
        clonedScene?.traverse((obj) => {
            if (!found && obj.isBone) found = obj
        })
        return found
    }, [nodes, clonedScene])

    const trunkBoneEntries = useMemo(() => {
        if (!boneRoot) return []
        const map = new Map()
        const bones = []
        boneRoot.traverse((object) => {
            if (object.isBone) {
                bones.push(object)
                if (TRUNK_NAME_SET.has(object.name)) {
                    map.set(object.name, object)
                }
            }
        })
        return TRUNK_NAMES.map((name) => {
            let bone = map.get(name)
            if (!bone) {
                bone = bones.find((b) => b.name === name || b.name.startsWith(name) || b.name.includes(name))
            }
            if (!bone) return null
            const data = trunkData?.[name]
            const scale = data?.scale ?? [1, 1, 1]
            return { name, bone, scale }
        }).filter(Boolean)
    }, [boneRoot])

    const trunkInstances = useMemo(() => {
        const treeScale = (props.scale ?? 1) * 1.5
        return trunkBoneEntries.map((entry) => ({
            key: entry.name,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [entry.scale[0] * treeScale, entry.scale[1] * treeScale, entry.scale[2] * treeScale],
        }))
    }, [trunkBoneEntries, props.scale])

    const trunkColliderGeometry = useMemo(() => {
        const direct = nodes?.trunk_01
        if (direct && (direct.isMesh || direct.isSkinnedMesh) && direct.geometry) {
            return direct.geometry
        }
        let found = null
        clonedScene?.traverse((obj) => {
            if (!found && (obj.isMesh || obj.isSkinnedMesh) && obj.name === 'trunk_01' && obj.geometry) {
                found = obj
            }
        })
        return found?.geometry ?? null
    }, [nodes, clonedScene])

    const colliderMaterial = props.rigidBodyMaterial

    // Note: collider geometry comes from the GLB; do not dispose it here.

    useEffect(() => {
        // Init bone wind params
        if (boneRoot) {
            boneRoot.traverse((object) => {
                if (!object.isBone) return

                if (!object.userData.initialRotation) {
                    object.userData.initialRotation = object.rotation.clone()
                }

                const treeSeed = props.seed ?? 0
                if (object.userData.windSeedSource !== treeSeed) {
                    const base = hashStringTo01(object.name || `${object.id}`)
                    const h = (base + treeSeed) % 1
                    object.userData.windPhase = h * Math.PI * 2
                    object.userData.windSeed = h * 100.0
                    object.userData.axisMix = 0.35 + h * 0.65
                    object.userData.windSeedSource = treeSeed
                }
            })
        }
    }, [boneRoot, props.seed])

    useEffect(() => {
        return () => {
            if (!clonedScene) return
            // Dispose per-tree skeletons (and their bone textures) on unmount
            clonedScene.traverse((obj) => {
                if (obj.isSkinnedMesh && obj.skeleton) {
                    if (obj.skeleton.boneTexture) {
                        obj.skeleton.boneTexture.dispose()
                    }
                    obj.skeleton.dispose()
                }
            })
        }
    }, [clonedScene])

    useFrame((state) => {
        if (!boneRoot) return

        const { speed: windSpeed, strength: windStrength } = windParameters
        const time = state.clock.elapsedTime

        const angleMax = treeParameters.boneAngleMax ?? 0.18
        const speedMul = treeParameters.boneSpeedMul ?? 1.0
        const noiseStrength = treeParameters.boneNoiseStrength ?? 0.65
        const noiseScale = treeParameters.boneNoiseScale ?? 0.75
        const noiseSpeed = treeParameters.boneNoiseSpeed ?? 0.35
        const xFactor = treeParameters.boneXFactor ?? 0.55
        const zFactor = treeParameters.boneZFactor ?? 1.0
        const parentInfluence = THREE.MathUtils.clamp(treeParameters.boneParentInfluence ?? 0.65, 0, 1.25)
        const root = innerRef.current
        const { quat, invQuat, vec } = windTmpRef.current

        // Build world-space wind vector
        vec.set(Math.cos(windParameters.direction ?? 0), 0, Math.sin(windParameters.direction ?? 0))

        if (root) {
            // Convert world wind into the tree's local space (full rotation, not just yaw)
            root.getWorldQuaternion(quat)
            invQuat.copy(quat).invert()
            vec.applyQuaternion(invQuat)
        }
        const windDirX = vec.x
        const windDirZ = vec.z

        boneRoot.traverse((object) => {
            if (object.isBone && object.userData.initialRotation) {
                const initial = object.userData.initialRotation

                // Base periodic sway (keeps a consistent "wind direction")
                const base = Math.sin(time * windSpeed * speedMul + (object.userData.windPhase ?? 0)) * windStrength

                // Smooth random modulation (like grass wind, but CPU-side): simplex noise in [-1, 1]
                const n = treeBoneNoise2D((object.userData.windSeed ?? 0) + time * noiseSpeed, object.position.y * noiseScale)

                // Convert noise to an amplitude multiplier around 1.0
                const amp = THREE.MathUtils.clamp(1.0 + n * noiseStrength, 0.0, 2.5)

                // Final angle with user-controlled max
                const localAngle = base * amp * angleMax

                // Hierarchy influence: let child bones inherit a portion of the parent's applied sway.
                // This controls how strongly the chain "follows" previous bones.
                const parentAngle = object.parent?.isBone ? object.parent.userData._appliedAngle ?? 0 : 0
                const angle = localAngle + parentAngle * parentInfluence
                object.userData._appliedAngle = angle

                // Slight axis variation per bone
                const axisMix = object.userData.axisMix ?? 1.0
                object.rotation.z = initial.z + angle * zFactor * windDirZ * axisMix
                object.rotation.x = initial.x + angle * xFactor * windDirX * axisMix
            }
        })

        const bodies = trunkBodiesRef.current
        if (bodies && trunkBoneEntries.length > 0) {
            const { pos, quat } = trunkTmpRef.current
            for (let i = 0; i < trunkBoneEntries.length; i++) {
                const bone = trunkBoneEntries[i]?.bone
                const body = bodies[i]
                if (!bone || !body) continue
                bone.getWorldPosition(pos)
                bone.getWorldQuaternion(quat)
                body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z })
                body.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
            }
        }
    })

    if (!boneRoot || !nodes?.trunk) return null

    return (
        <>
            <group {...props} scale={(props.scale ?? 1) * 1.5}>
                <group ref={innerRef} rotation-y={Math.PI / 2}>
                    <skinnedMesh geometry={nodes.trunk.geometry} material={props.trunkMaterial} skeleton={nodes.trunk.skeleton} dispose={null} />
                    <primitive object={boneRoot} />
                    <TreeLeaves nodes={nodes} rootRef={innerRef} boneRoot={boneRoot} leavesMaterial={props.leavesMaterial} />
                </group>
            </group>
            {trunkColliderGeometry && trunkInstances.length > 0 && (
                <InstancedRigidBodies ref={trunkBodiesRef} instances={trunkInstances} type="kinematicPosition" colliders="trimesh">
                    <instancedMesh
                        args={[trunkColliderGeometry, colliderMaterial, trunkInstances.length]}
                        count={trunkInstances.length}
                        visible={true}
                        frustumCulled={false}
                        dispose={null}
                    />
                </InstancedRigidBodies>
            )}
        </>
    )
}
