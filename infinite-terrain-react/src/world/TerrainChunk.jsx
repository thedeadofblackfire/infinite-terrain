import { useMemo, useEffect } from 'react'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'

import Grass from './Grass.jsx'
import Stones from './Stones.jsx'
import useStore from '../stores/useStore.jsx'
import { generateChunkStones } from './stoneUtils.js'

export default function TerrainChunk({ x, z, size, noise2D, noiseTexture, terrainMaterial, grassMaterial, stoneMaterial, stoneGeometry }) {
    const terrainParameters = useStore((s) => s.terrainParameters)
    const stoneParameters = useStore((s) => s.stoneParameters)

    const stoneField = useMemo(() => {
        const capacity = 500 // keep instancedMesh capacity stable to avoid recreate/dispose glitches

        // 1. Generate stones for THIS chunk (for rendering)
        const current = generateChunkStones(x, z, size, noise2D, stoneParameters, terrainParameters)

        // 2. Generate stones for 8 NEIGHBORS (for grass suppression at borders)
        // Pass skipMatrices=true to save performance
        const neighbors = []
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue // skip self

                const neighborStones = generateChunkStones(
                    x + dx,
                    z + dz,
                    size,
                    noise2D,
                    stoneParameters,
                    terrainParameters,
                    true, // skipMatrices
                    true // minimalData (skip height/rotation calc)
                ).stones

                // Adjust neighbor stone positions to be relative to THIS chunk's center
                // Neighbor local X is relative to neighbor center.
                // Neighbor center is (dx * size, dz * size) away from current center.
                // So adjusted local pos = neighborLocal + (dx * size, dz * size)
                for (const s of neighborStones) {
                    neighbors.push({
                        ...s,
                        x: s.x + dx * size,
                        z: s.z + dz * size,
                    })
                }
            }
        }

        // Combine current stones + neighbor stones for grass suppression
        const allStonesForGrass = [...current.stones, ...neighbors]

        return {
            instances: current.instances,
            stones: allStonesForGrass,
            currentStones: current.stones, // Pass raw data of current stones for physics
            capacity,
        }
    }, [
        stoneParameters.enabled,
        stoneParameters.count,
        stoneParameters.minScale,
        stoneParameters.maxScale,
        stoneParameters.yOffset,
        stoneParameters.noiseScale,
        stoneParameters.noiseThreshold,
        noise2D,
        x,
        z,
        size,
        terrainParameters.scale,
        terrainParameters.amplitude,
    ])

    // Geometry
    const geometry = useMemo(() => {
        const segments = terrainParameters.segments
        const scale = terrainParameters.scale
        const amplitude = terrainParameters.amplitude

        const geo = new THREE.PlaneGeometry(size, size, segments, segments)
        const posAttribute = geo.attributes.position

        const chunkWorldX = x * size
        const chunkWorldZ = z * size

        for (let i = 0; i < posAttribute.count; i++) {
            const px = posAttribute.getX(i)
            const py = posAttribute.getY(i)

            const worldX = px + chunkWorldX
            const worldZ = -py + chunkWorldZ

            const heightVal = noise2D(worldX * scale, worldZ * scale) * amplitude

            posAttribute.setZ(i, heightVal)
        }

        return geo
    }, [noise2D, size, x, z, terrainParameters])

    useEffect(() => {
        return () => {
            geometry.dispose()
        }
    }, [geometry])

    return (
        <group position={[x * size, 0, z * size]}>
            <RigidBody type="fixed" colliders="trimesh" userData={{ name: 'terrain' }}>
                <mesh geometry={geometry} material={terrainMaterial} rotation-x={-Math.PI / 2} />
            </RigidBody>

            <Grass
                size={size}
                chunkX={x * size}
                chunkZ={z * size}
                chunkIndexX={x}
                chunkIndexZ={z}
                noise2D={noise2D}
                noiseTexture={noiseTexture}
                scale={terrainParameters.scale}
                amplitude={terrainParameters.amplitude}
                stones={stoneField.stones}
                grassMaterial={grassMaterial}
            />

            <Stones stones={stoneField.currentStones} maxCount={stoneField.capacity} stoneMaterial={stoneMaterial} stoneGeometry={stoneGeometry} />
        </group>
    )
}
