import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function TreeLeaves({ nodes, rootRef, boneRoot, leavesMaterial }) {
    const instancedMeshRef = useRef(null)
    const tmpRef = useRef({
        invRoot: new THREE.Matrix4(),
        local: new THREE.Matrix4(),
    })

    // Geometry
    const bushMeshes = useMemo(() => {
        return Object.keys(nodes)
            .filter((key) => key.startsWith('bush_'))
            .map((key) => nodes[key])
            .filter((m) => m && (m.isMesh || m.isSkinnedMesh))
    }, [nodes])
    const bushGeometry = bushMeshes[0]?.geometry ?? null

    useEffect(() => {
        // Hide bush meshes and use them only as "transform drivers" for instancing
        for (const mesh of bushMeshes) {
            mesh.visible = false
            if (mesh.geometry && !mesh.geometry.boundingSphere) {
                mesh.geometry.computeBoundingSphere()
            }
        }
    }, [bushMeshes])

    useFrame(() => {
        // Update instanced bushes to follow the animated skeleton hierarchy
        const root = rootRef?.current
        const bone = boneRoot ?? nodes?.Bone
        const inst = instancedMeshRef.current
        if (!root || !inst || bushMeshes.length === 0) return

        root.updateMatrixWorld(true)
        if (bone) {
            bone.updateMatrixWorld(true)
        }

        const { invRoot, local } = tmpRef.current
        invRoot.copy(root.matrixWorld).invert()

        for (let i = 0; i < bushMeshes.length; i++) {
            const mesh = bushMeshes[i]
            mesh.updateMatrixWorld(true)
            local.multiplyMatrices(invRoot, mesh.matrixWorld)
            inst.setMatrixAt(i, local)
        }

        inst.instanceMatrix.needsUpdate = true
    })

    if (!bushGeometry || bushMeshes.length === 0) return null

    return <instancedMesh args={[bushGeometry, leavesMaterial, bushMeshes.length]} frustumCulled={false} ref={instancedMeshRef} dispose={null} />
}
