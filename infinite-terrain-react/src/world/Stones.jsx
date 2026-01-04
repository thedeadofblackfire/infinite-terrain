import { useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { InstancedRigidBodies } from '@react-three/rapier'

export default function Stones({ stones, maxCount, stoneMaterial, stoneGeometry }) {
    const instances = useMemo(() => {
        if (!stones) return []
        return stones.map((stone, i) => ({
            key: 'stone_' + i,
            position: [stone.x, stone.y, stone.z],
            rotation: [stone.rotX || 0, stone.rotY, stone.rotZ || 0],
            scale: [stone.scaleX, stone.scaleY, stone.scaleZ],
        }))
    }, [stones])

    // If no stones, we can render nothing. But we usually keep the mesh mounted with count=0.
    // InstancedRigidBodies manages the instanceMatrix of the child instancedMesh.
    // If instances array is empty, it should handle it gracefully or we render nothing.

    if (!instances || instances.length === 0) {
        return null
    }

    return (
        <InstancedRigidBodies
            instances={instances}
            type="fixed"
            colliders="hull" // Optimized: "hull" is much faster/stable than "trimesh" for convex shapes
        >
            <instancedMesh args={[stoneGeometry, stoneMaterial, maxCount]} count={instances.length} frustumCulled={false} />
        </InstancedRigidBodies>
    )
}
