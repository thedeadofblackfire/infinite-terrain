import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { createNoise2D } from 'simplex-noise'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'
import useStore from '../stores/useStore.jsx'
import { mulberry32 } from './utils/randomUtils.js'
import { TreeLeaves } from './TreeLeaves.jsx'

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

    useEffect(() => {
        // Init bone wind params
        if (nodes?.Bone) {
            nodes.Bone.traverse((object) => {
                if (object.isBone && !object.userData.initialRotation) {
                    object.userData.initialRotation = object.rotation.clone()

                    const base = hashStringTo01(object.name || `${object.id}`)
                    const treeSeed = props.seed ?? 0
                    const h = (base + treeSeed) % 1
                    object.userData.windPhase = h * Math.PI * 2
                    object.userData.windSeed = h * 100.0
                    object.userData.axisMix = 0.35 + h * 0.65
                }
            })
        }
    }, [nodes, props.seed])

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
        if (!nodes?.Bone) return

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

        nodes.Bone.traverse((object) => {
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
    })

    if (!nodes?.Bone || !nodes?.trunk) return null

    return (
        <group {...props} scale={(props.scale ?? 1) * 1.5}>
            <group ref={innerRef} rotation-y={Math.PI / 2}>
                <skinnedMesh geometry={nodes.trunk.geometry} material={props.trunkMaterial} skeleton={nodes.trunk.skeleton} dispose={null} />
                <primitive object={nodes.Bone} />
                <TreeLeaves nodes={nodes} rootRef={innerRef} leavesMaterial={props.leavesMaterial} />
            </group>
        </group>
    )
}
