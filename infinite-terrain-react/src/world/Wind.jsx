import { useMemo, useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'

import windLineVertexShader from '../shaders/windLine/vertex.glsl'
import windLineFragmentShader from '../shaders/windLine/fragment.glsl'

import useStore from '../stores/useStore.jsx'
import { generateWindLineInstances } from './utils/windUtils.js'
import { sharedNoise2D } from './utils/worldNoise.js'
import noiseTextureUrl from '/textures/noiseTexture.png'

export default function Wind() {
    const [activeChunks, setActiveChunks] = useState([])
    const currentChunk = useRef({ x: 0, z: 0, size: 0 })

    const terrainParameters = useStore((state) => state.terrainParameters)
    const borderParameters = useStore((state) => state.borderParameters)
    const ditheringParameters = useStore((state) => state.ditheringParameters)
    const windParameters = useStore((state) => state.windParameters)
    const windDirection = windParameters.direction
    const windLineParameters = useStore((state) => state.windLineParameters)
    const windLineWidth = windLineParameters.width
    const terrainScale = terrainParameters.scale
    const terrainAmplitude = terrainParameters.amplitude
    const chunkSize = terrainParameters.chunkSize
    const windChunkSize = chunkSize
    const borderNoiseStrength = borderParameters.noiseStrength
    const borderNoiseScale = borderParameters.noiseScale
    const borderCircleRadius = borderParameters.circleRadiusFactor
    const borderGroundOffset = borderParameters.groundOffset
    const borderGroundFadeOffset = borderParameters.groundFadeOffset
    const ditherModeValue = ditheringParameters.ditherMode === 'Bayer' ? 1 : 0

    const baseGeometry = useMemo(() => {
        const geometry = new THREE.PlaneGeometry(10, windLineWidth, 20, 1)
        // geometry.rotateX(-Math.PI / 2) // uncomment to rotate the plane horizontally
        return geometry
    }, [windLineWidth])

    const noiseTexture = useTexture(
        noiseTextureUrl,
        (texture) => {
            texture.wrapS = THREE.RepeatWrapping
            texture.wrapT = THREE.RepeatWrapping
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            return texture
        },
        [noiseTextureUrl]
    )

    const material = useMemo(() => {
        return new THREE.ShaderMaterial({
            vertexShader: windLineVertexShader,
            fragmentShader: windLineFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uTimeMultiplier: { value: 0.1 },
                uAlphaMultiplier: { value: 0.5 },
                uStrength: { value: 1.0 },
                uSpeed: { value: 1.0 },
                uLengthMultiplier: { value: 1.0 },
                uRange: { value: 4.0 },
                uLengthMultiplier: { value: 1.0 },
                uCircleCenter: { value: new THREE.Vector3() },
                uTrailPatchSize: { value: chunkSize },
                uCircleRadiusFactor: { value: borderCircleRadius },
                uGroundOffset: { value: borderGroundOffset },
                uGroundFadeOffset: { value: borderGroundFadeOffset },
                uNoiseTexture: { value: noiseTexture },
                uNoiseStrength: { value: borderNoiseStrength },
                uNoiseScale: { value: borderNoiseScale },
                uPixelSize: { value: ditheringParameters.pixelSize },
                uDitherMode: { value: ditherModeValue },
            },
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        })
    }, [])

    useEffect(() => {
        const u = material.uniforms
        u.uTrailPatchSize.value = chunkSize
        u.uCircleRadiusFactor.value = borderCircleRadius
        u.uGroundOffset.value = borderGroundOffset
        u.uGroundFadeOffset.value = borderGroundFadeOffset
        u.uNoiseTexture.value = noiseTexture
        u.uNoiseStrength.value = borderNoiseStrength
        u.uNoiseScale.value = borderNoiseScale
        u.uTimeMultiplier.value = windLineParameters.timeMultiplier
        u.uAlphaMultiplier.value = windLineParameters.alphaMultiplier
        u.uLengthMultiplier.value = windLineParameters.lengthMultiplier
        u.uStrength.value = windParameters.strength
        u.uSpeed.value = windParameters.speed
        u.uPixelSize.value = ditheringParameters.pixelSize
        u.uDitherMode.value = ditherModeValue
    }, [
        material,
        chunkSize,
        borderCircleRadius,
        borderGroundOffset,
        borderGroundFadeOffset,
        noiseTexture,
        borderNoiseStrength,
        borderNoiseScale,
        windLineParameters.timeMultiplier,
        windLineParameters.alphaMultiplier,
        windLineParameters.lengthMultiplier,
        windParameters.strength,
        windParameters.speed,
        ditheringParameters.pixelSize,
        ditherModeValue,
    ])

    useFrame(() => {
        const state = useStore.getState()
        const ballPosition = state.ballPosition
        const safeChunkSize = Math.max(0.0001, windChunkSize)
        const chunkX = Math.round(ballPosition.x / safeChunkSize)
        const chunkZ = Math.round(ballPosition.z / safeChunkSize)

        if (chunkX !== currentChunk.current.x || chunkZ !== currentChunk.current.z || currentChunk.current.size !== safeChunkSize || activeChunks.length === 0) {
            currentChunk.current = { x: chunkX, z: chunkZ, size: safeChunkSize }

            const newChunks = []
            for (let x = -1; x <= 1; x++) {
                for (let z = -1; z <= 1; z++) {
                    newChunks.push({
                        x: chunkX + x,
                        z: chunkZ + z,
                        key: `${chunkX + x},${chunkZ + z}`,
                    })
                }
            }
            setActiveChunks(newChunks)
        }
    })

    const windLines = useMemo(() => {
        if (!activeChunks || activeChunks.length === 0) return []
        const lines = []
        for (const chunk of activeChunks) {
            const originX = chunk.x * windChunkSize
            const originZ = chunk.z * windChunkSize
            const chunkLines = generateWindLineInstances(chunk.x, chunk.z, windChunkSize, windLineParameters)
            for (const line of chunkLines) {
                lines.push({
                    position: [line.position[0] + originX, line.position[1], line.position[2] + originZ],
                    timeOffset: line.timeOffset ?? 0,
                })
            }
        }
        return lines
    }, [activeChunks, chunkSize, windLineParameters, windChunkSize])

    const mergedGeometry = useMemo(() => {
        if (windLines.length === 0) {
            return new THREE.BufferGeometry()
        }

        const basePosition = baseGeometry.attributes.position
        const baseUv = baseGeometry.attributes.uv
        const baseIndex = baseGeometry.index
        const baseVertexCount = basePosition.count
        const baseIndexCount = baseIndex ? baseIndex.count : 0

        const totalVertexCount = baseVertexCount * windLines.length
        const totalIndexCount = baseIndex ? baseIndexCount * windLines.length : 0
        const positions = new Float32Array(totalVertexCount * 3)
        const uvs = new Float32Array(totalVertexCount * 2)
        const timeOffsets = new Float32Array(totalVertexCount)
        const indices = baseIndex ? new (totalVertexCount > 65535 ? Uint32Array : Uint16Array)(totalIndexCount) : null

        const angle = -Math.PI / 2 + (windDirection ?? 0)
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)

        for (let i = 0; i < windLines.length; i++) {
            const [offsetX, offsetY, offsetZ] = windLines[i].position
            const timeOffset = windLines[i].timeOffset
            const vertexOffset = i * baseVertexCount
            const indexOffset = i * baseIndexCount

            for (let v = 0; v < baseVertexCount; v++) {
                const x = basePosition.getX(v)
                const y = basePosition.getY(v)
                const z = basePosition.getZ(v)

                const rotatedX = x * cos - z * sin
                const rotatedZ = x * sin + z * cos
                const worldX = rotatedX + offsetX
                const worldZ = rotatedZ + offsetZ
                const yOffset = sharedNoise2D(worldX * terrainScale, worldZ * terrainScale) * terrainAmplitude
                const worldY = y + offsetY + yOffset

                const posIndex = (vertexOffset + v) * 3
                positions[posIndex] = worldX
                positions[posIndex + 1] = worldY
                positions[posIndex + 2] = worldZ

                const uvIndex = (vertexOffset + v) * 2
                uvs[uvIndex] = baseUv.getX(v)
                uvs[uvIndex + 1] = baseUv.getY(v)

                timeOffsets[vertexOffset + v] = timeOffset
            }

            if (indices) {
                for (let j = 0; j < baseIndexCount; j++) {
                    indices[indexOffset + j] = baseIndex.getX(j) + vertexOffset
                }
            }
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
        geometry.setAttribute('aTimeOffset', new THREE.BufferAttribute(timeOffsets, 1))
        if (indices) {
            geometry.setIndex(new THREE.BufferAttribute(indices, 1))
        }
        geometry.computeBoundingSphere()
        return geometry
    }, [windLines, baseGeometry, windDirection, terrainScale, terrainAmplitude])

    useEffect(() => {
        return () => {
            mergedGeometry.dispose()
        }
    }, [mergedGeometry])

    useFrame(({ clock }) => {
        const state = useStore.getState()
        material.uniforms.uTime.value = clock.elapsedTime
        material.uniforms.uCircleCenter.value.copy(state.smoothedCircleCenter)
    })

    return <mesh geometry={mergedGeometry} material={material} frustumCulled={false} dispose={null} />
}
