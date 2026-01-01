import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import useStore from '../stores/useStore.jsx'
import { mulberry32, smoothstep } from './stoneUtils.js'

export default function Grass({ size, chunkX, chunkZ, chunkIndexX, chunkIndexZ, noise2D, scale, amplitude, stones, grassMaterial }) {
    const grassParameters = useStore((s) => s.grassParameters)
    const stoneParameters = useStore((s) => s.stoneParameters)

    // Geometry
    const grassGeometry = useMemo(() => {
        const vertexNumber = (grassParameters.segmentsCount + 1) * 2
        const indices = []

        for (let i = 0; i < grassParameters.segmentsCount; ++i) {
            const vi = i * 2
            indices[i * 12] = vi
            indices[i * 12 + 1] = vi + 1
            indices[i * 12 + 2] = vi + 2

            indices[i * 12 + 3] = vi + 2
            indices[i * 12 + 4] = vi + 1
            indices[i * 12 + 5] = vi + 3

            const fi = vertexNumber + vi
            indices[i * 12 + 6] = fi + 2
            indices[i * 12 + 7] = fi + 1
            indices[i * 12 + 8] = fi

            indices[i * 12 + 9] = fi + 3
            indices[i * 12 + 10] = fi + 1
            indices[i * 12 + 11] = fi + 2
        }

        const grassGeometry = new THREE.InstancedBufferGeometry()
        grassGeometry.instanceCount = grassParameters.count
        grassGeometry.setIndex(indices)
        grassGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1 + size / 2)

        // distribute blades inside this chunk; Y from terrain noise
        const positions = new Float32Array(grassParameters.count * 3)
        const stoneInfluence = new Float32Array(grassParameters.count)
        const rng = mulberry32((chunkIndexX * 73856093) ^ (chunkIndexZ * 19349663) ^ 0xdecafbad)

        for (let i = 0; i < grassParameters.count; i++) {
            const x = (rng() - 0.5) * size
            const z = (rng() - 0.5) * size

            const worldX = x + chunkX
            const worldZ = z + chunkZ

            const y = noise2D ? noise2D(worldX * scale, worldZ * scale) * amplitude : 0

            positions[i * 3] = x
            positions[i * 3 + 1] = y
            positions[i * 3 + 2] = z

            // Fade grass height near actual stones (uses the exact stone instances for this chunk)
            if (stoneParameters?.enabled && Array.isArray(stones) && stones.length > 0) {
                let best = 0
                const clearMul = stoneParameters.grassClearRadiusMultiplier
                const fadeW = stoneParameters.grassFadeWidth

                for (let s = 0; s < stones.length; s++) {
                    const dx = x - stones[s].x
                    const dz = z - stones[s].z
                    const dy = y - (stones[s].y ?? 0)

                    // Rotate into stone local XZ frame (yaw) for oriented ellipsoid distance
                    const rotY = stones[s].rotY ?? 0
                    const c = Math.cos(rotY)
                    const sn = Math.sin(rotY)
                    const lx = c * dx + sn * dz
                    const lz = -sn * dx + c * dz

                    // Use 3D ellipsoid distance so height/slope are considered.
                    // rx/ry are the stone's actual instanced scales in chunk-local space.
                    const rx = Math.max(0.0001, (stones[s].rx ?? 0.0001) * clearMul)
                    const ry = Math.max(0.0001, (stones[s].ry ?? 0.0001) * clearMul)
                    const distN = Math.sqrt((lx * lx) / (rx * rx) + (dy * dy) / (ry * ry) + (lz * lz) / (rx * rx))

                    // fadeW is in world units; convert to normalized distance in XZ
                    const fadeN = Math.max(0.0, fadeW) / rx
                    const influence = 1.0 - smoothstep(1.0, 1.0 + fadeN, distN)
                    if (influence > best) best = influence
                    if (best >= 0.999) break
                }

                stoneInfluence[i] = Math.max(0, Math.min(1, best))
            } else {
                stoneInfluence[i] = 0
            }
        }

        grassGeometry.setAttribute('aInstancePosition', new THREE.InstancedBufferAttribute(positions, 3))
        grassGeometry.setAttribute('aStoneInfluence', new THREE.InstancedBufferAttribute(stoneInfluence, 1))

        return grassGeometry
    }, [
        grassParameters.segmentsCount,
        grassParameters.count,
        size,
        chunkX,
        chunkZ,
        chunkIndexX,
        chunkIndexZ,
        noise2D,
        scale,
        amplitude,
        stones,
        stoneParameters?.enabled,
        stoneParameters?.grassClearRadiusMultiplier,
        stoneParameters?.grassFadeWidth,
    ])

    useEffect(() => {
        return () => {
            grassGeometry.dispose()
        }
    }, [grassGeometry])

    return <mesh geometry={grassGeometry} material={grassMaterial} />
}
