import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

export default function Stones({ instances, maxCount, stoneMaterial }) {
    const meshRef = useRef()

    const geometry = useMemo(() => {
        // Low-poly stone
        return new THREE.IcosahedronGeometry(1, 0)
    }, [])

    useEffect(() => {
        return () => {
            geometry.dispose()
        }
    }, [geometry])

    useLayoutEffect(() => {
        const mesh = meshRef.current
        if (!mesh) return

        const count = instances?.length ?? 0
        mesh.count = Math.min(count, maxCount)

        for (let i = 0; i < mesh.count; i++) {
            mesh.setMatrixAt(i, instances[i].matrix)
        }

        mesh.instanceMatrix.needsUpdate = true
    }, [instances, maxCount])

    // Always keep the instanced mesh mounted so R3F doesn't dispose shared geometry when instances temporarily become empty.
    // We just set mesh.count = 0 above when there's nothing to draw.
    return <instancedMesh ref={meshRef} args={[geometry, stoneMaterial, maxCount]} frustumCulled={false} />
}
