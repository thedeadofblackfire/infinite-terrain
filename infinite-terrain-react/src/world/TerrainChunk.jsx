import { useMemo, useEffect } from 'react'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'

import Grass from './Grass.jsx'
import Stones from './Stones.jsx'
import Trees from './Trees.jsx'
import useStore from '../stores/useStore.jsx'
import { generateChunkData } from './utils/chunkUtils.js'

export default function TerrainChunk({
    x,
    z,
    size,
    noise2D,
    noiseTexture,
    terrainMaterial,
    grassMaterial,
    stoneMaterial,
    stoneGeometry,
    leavesMaterial,
    trunkMaterial,
    treeScene,
}) {
    const terrainParameters = useStore((s) => s.terrainParameters)
    const stoneParameters = useStore((s) => s.stoneParameters)

    const stonesKey = useMemo(
        () =>
            `stones_${x}_${z}_${stoneParameters.count}_${stoneParameters.minScale}_${stoneParameters.maxScale}_${stoneParameters.yOffset}_${stoneParameters.noiseScale}_${stoneParameters.noiseThreshold}`,
        [x, z, stoneParameters.count, stoneParameters.minScale, stoneParameters.maxScale, stoneParameters.yOffset, stoneParameters.noiseScale, stoneParameters.noiseThreshold]
    )

    const { stoneField, treeInstances } = useMemo(() => {
        return generateChunkData(x, z, size, noise2D, stoneParameters, terrainParameters)
    }, [x, z, size, noise2D, stoneParameters, terrainParameters])

    const geometry = useMemo(() => {
        const { segments, scale, amplitude } = terrainParameters
        const geo = new THREE.PlaneGeometry(size, size, segments, segments)
        const posAttribute = geo.attributes.position
        const chunkWorldX = x * size
        const chunkWorldZ = z * size

        for (let i = 0; i < posAttribute.count; i++) {
            const worldX = posAttribute.getX(i) + chunkWorldX
            const worldZ = -posAttribute.getY(i) + chunkWorldZ
            posAttribute.setZ(i, noise2D(worldX * scale, worldZ * scale) * amplitude)
        }
        return geo
    }, [noise2D, size, x, z, terrainParameters])

    useEffect(() => () => geometry.dispose(), [geometry])

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

            <Stones key={stonesKey} stones={stoneField.currentStones} maxCount={stoneField.capacity} stoneMaterial={stoneMaterial} stoneGeometry={stoneGeometry} />

            <Trees trees={treeInstances} leavesMaterial={leavesMaterial} trunkMaterial={trunkMaterial} treeScene={treeScene} />
        </group>
    )
}
