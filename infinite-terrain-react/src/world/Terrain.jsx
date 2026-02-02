import { useState, useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, useGLTF } from '@react-three/drei'
import { createNoise2D } from 'simplex-noise'
import { gsap } from 'gsap'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import * as THREE from 'three'

import TerrainChunk from './TerrainChunk.jsx'
import useStore from '../stores/useStore.jsx'
import usePhases, { PHASES } from '../stores/usePhases.jsx'
import { mulberry32 } from './utils/randomUtils.js'

import noiseTextureUrl from '/textures/noiseTexture.png'
import alphaLeavesUrl from '../assets/textures/alpha_leaves.png'
import treeUrl from '../assets/models/tree.glb'

import terrainVertexShader from '../shaders/terrain/vertex.glsl'
import terrainFragmentShader from '../shaders/terrain/fragment.glsl'
import grassVertexShader from '../shaders/grass/vertex.glsl'
import grassFragmentShader from '../shaders/grass/fragment.glsl'
import stonesVertexShader from '../shaders/stones/vertex.glsl'
import stonesFragmentShader from '../shaders/stones/fragment.glsl'
import bushesVertexShader from '../shaders/leaves/vertex.glsl'
import bushesFragmentShader from '../shaders/leaves/fragment.glsl'
import trunkVertexShader from '../shaders/trunk/vertex.glsl'
import trunkFragmentShader from '../shaders/trunk/fragment.glsl'

const WORLD_NOISE_SEED = 1337
const sharedNoise2D = createNoise2D(mulberry32(WORLD_NOISE_SEED))

export default function Terrain() {
    const [activeChunks, setActiveChunks] = useState([])

    const currentChunk = useRef({ x: 0, z: 0 })
    const radiusAnimationRef = useRef(null)
    const prevPhaseRef = useRef(PHASES.loading)

    const phase = usePhases((s) => s.phase)

    const chunkSize = useStore((s) => s.terrainParameters.chunkSize)
    const terrainParameters = useStore((s) => s.terrainParameters)
    const borderParameters = useStore((s) => s.borderParameters)
    const grassParameters = useStore((s) => s.grassParameters)
    const windParameters = useStore((s) => s.windParameters)
    const stoneParameters = useStore((s) => s.stoneParameters)
    const treeParameters = useStore((s) => s.treeParameters)
    const trailParameters = useStore((s) => s.trailParameters)
    const ditheringParameters = useStore((s) => s.ditheringParameters)
    const setBorderParameters = useStore((s) => s.setBorderParameters)

    const noise2D = sharedNoise2D

    // Textures
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
    const alphaMap = useTexture(alphaLeavesUrl)

    // Tree model
    const treeModel = useGLTF(treeUrl)

    // Terrain material - shared across all chunks
    const terrainMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uBaseColor: { value: new THREE.Color(terrainParameters.color) },
                uCircleCenter: { value: new THREE.Vector3() },
                uTrailPatchSize: { value: chunkSize },
                uCircleRadiusFactor: { value: borderParameters.circleRadiusFactor },
                uGrassFadeOffset: { value: borderParameters.grassFadeOffset },
                uGroundOffset: { value: borderParameters.groundOffset },
                uGroundFadeOffset: { value: borderParameters.groundFadeOffset },
                uNoiseTexture: { value: noiseTexture },
                uNoiseStrength: { value: borderParameters.noiseStrength },
                uNoiseScale: { value: borderParameters.noiseScale },
                uPixelSize: { value: ditheringParameters.pixelSize },
                uDitherMode: { value: ditheringParameters.ditherMode === 'Bayer' ? 1 : 0 }, // 0: Diamond, 1: Bayer
            },
            vertexShader: terrainVertexShader,
            fragmentShader: terrainFragmentShader,
        })
    }, [terrainParameters, chunkSize, borderParameters, noiseTexture, ditheringParameters])

    // Grass material - shared across all chunks
    const grassMaterial = useMemo(
        () =>
            new THREE.ShaderMaterial({
                uniforms: {
                    uPixelSize: { value: ditheringParameters.pixelSize },
                    uDitherMode: { value: ditheringParameters.ditherMode === 'Bayer' ? 1 : 0 }, // 0: Diamond, 1: Bayer
                    uTime: { value: 0 },
                    uGrassSegments: { value: grassParameters.segmentsCount },
                    uGrassChunkSize: { value: chunkSize },
                    uGrassWidth: { value: grassParameters.width },
                    uGrassHeight: { value: grassParameters.height },
                    uGrassBaseColor: { value: new THREE.Color(grassParameters.colorBase) },
                    uGrassTopColor: { value: new THREE.Color(grassParameters.colorTop) },
                    uLeanFactor: { value: grassParameters.leanFactor },

                    // Flowers (procedural)
                    uFlowersEnabled: { value: grassParameters.flowersEnabled ? 1.0 : 0.0 },
                    uFlowerDensity: { value: grassParameters.flowerDensity },
                    uFlowerNoiseScale: { value: grassParameters.flowerNoiseScale },
                    uFlowerHeightBoost: { value: grassParameters.flowerHeightBoost },
                    uFlowerTipStart: { value: grassParameters.flowerTipStart },
                    uFlowerBaseScale: { value: grassParameters.flowerBaseScale },
                    uFlowerExpand: { value: grassParameters.flowerExpand },
                    uFlowerColorA: { value: new THREE.Color(grassParameters.flowerColorA) },
                    uFlowerColorB: { value: new THREE.Color(grassParameters.flowerColorB) },
                    uFlowerColorC: { value: new THREE.Color(grassParameters.flowerColorC) },
                    uFlowerColorD: { value: new THREE.Color(grassParameters.flowerColorD) },

                    uWindDirection: { value: windParameters.direction },
                    uWindScale: { value: windParameters.scale },
                    uWindStrength: { value: windParameters.strength },
                    uWindSpeed: { value: windParameters.speed },
                    uTrailTexture: { value: null },
                    uBallPosition: { value: new THREE.Vector3() },
                    uCircleCenter: { value: new THREE.Vector3() },
                    uTrailCanvasSize: { value: trailParameters.chunkSize },
                    uSobelMode: { value: grassParameters.sobelMode },

                    uNoiseTexture: { value: noiseTexture },
                    uNoiseStrength: { value: borderParameters.noiseStrength },
                    uNoiseScale: { value: borderParameters.noiseScale },
                    uCircleRadiusFactor: { value: borderParameters.circleRadiusFactor },
                    uGrassFadeOffset: { value: borderParameters.grassFadeOffset },
                    uGroundOffset: { value: borderParameters.groundOffset },
                    uGroundFadeOffset: { value: borderParameters.groundFadeOffset },
                },
                vertexShader: grassVertexShader,
                fragmentShader: grassFragmentShader,
                side: THREE.FrontSide,
            }),
        [grassParameters, windParameters, chunkSize, trailParameters.chunkSize, noiseTexture, borderParameters, ditheringParameters]
    )

    // Stone material - shared across all chunks
    const stoneMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uPixelSize: { value: ditheringParameters.pixelSize },
                uDitherMode: { value: ditheringParameters.ditherMode === 'Bayer' ? 1 : 0 }, // 0: Diamond, 1: Bayer

                uStoneColor: { value: new THREE.Color(stoneParameters.color) },

                // Border fade (match grass)
                uCircleCenter: { value: new THREE.Vector3() },
                uChunkSize: { value: chunkSize },
                uNoiseTexture: { value: noiseTexture },
                uNoiseStrength: { value: borderParameters.noiseStrength },
                uNoiseScale: { value: borderParameters.noiseScale },
                uCircleRadiusFactor: { value: borderParameters.circleRadiusFactor },
                uGrassFadeOffset: { value: borderParameters.grassFadeOffset },
            },
            vertexShader: stonesVertexShader,
            fragmentShader: stonesFragmentShader,
            vertexColors: false,
            side: THREE.FrontSide,
        })
    }, [stoneParameters.color, chunkSize, noiseTexture, borderParameters, ditheringParameters])

    // Shared stone geometry
    const stoneGeometry = useMemo(() => {
        return new THREE.IcosahedronGeometry(1, 0)
    }, [])

    // Tree leaves material - shared across all trees
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

                uCircleCenter: { value: new THREE.Vector3() },
                uChunkSize: { value: chunkSize },
                uNoiseStrength: { value: borderParameters.noiseStrength },
                uNoiseScale: { value: borderParameters.noiseScale },
                uCircleRadiusFactor: { value: borderParameters.circleRadiusFactor },
                uGrassFadeOffset: { value: borderParameters.grassFadeOffset },
                uBorderTreesMultiplier: { value: borderParameters.borderTreesMultiplier },
                uPixelSize: { value: ditheringParameters.pixelSize },
                uDitherMode: { value: ditheringParameters.ditherMode === 'Bayer' ? 1 : 0 }, // 0: Diamond, 1: Bayer
            },
            vertexShader: bushesVertexShader,
            fragmentShader: bushesFragmentShader,
            color: new THREE.Color(treeParameters.leavesColor),
            alphaMap: alphaMap,
            transparent: false,
            side: THREE.DoubleSide,
            depthWrite: true,
            alphaToCoverage: false,
            alphaTest: treeParameters.bushAlphaTest,
            roughness: 1.0,
            metalness: 0.0,
        })
    }, [alphaMap, noiseTexture, treeParameters, chunkSize, borderParameters, ditheringParameters])

    // Tree trunk material - shared across all trees
    const trunkMaterial = useMemo(() => {
        return new CustomShaderMaterial({
            baseMaterial: THREE.MeshStandardMaterial,
            vertexShader: trunkVertexShader,
            fragmentShader: trunkFragmentShader,
            uniforms: {
                uTrunkColorA: { value: new THREE.Color(treeParameters.trunkColorA ?? '#ffffff') },
                uTrunkColorB: { value: new THREE.Color(treeParameters.trunkColorB ?? '#000000') },
                uCircleCenter: { value: new THREE.Vector3() },
                uChunkSize: { value: chunkSize },
                uNoiseTexture: { value: noiseTexture },
                uNoiseStrength: { value: borderParameters.noiseStrength },
                uNoiseScale: { value: borderParameters.noiseScale },
                uCircleRadiusFactor: { value: borderParameters.circleRadiusFactor },
                uGrassFadeOffset: { value: borderParameters.grassFadeOffset },
                uBorderTreesMultiplier: { value: borderParameters.borderTreesMultiplier },
                uPixelSize: { value: ditheringParameters.pixelSize },
                uDitherMode: { value: ditheringParameters.ditherMode === 'Bayer' ? 1 : 0 }, // 0: Diamond, 1: Bayer
            },
            roughness: 1.0,
            metalness: 0.0,
        })
    }, [treeParameters.trunkColorA, treeParameters.trunkColorB, chunkSize, noiseTexture, borderParameters, ditheringParameters])

    // Cleanup materials and shared assets on unmount
    useEffect(() => {
        return () => {
            terrainMaterial.dispose()
            grassMaterial.dispose()
            stoneMaterial.dispose()
            stoneGeometry.dispose()
            leavesMaterial.dispose()
            trunkMaterial.dispose()
            // Dispose shared textures when the entire terrain is gone
            noiseTexture.dispose()
            alphaMap.dispose()
        }
    }, [terrainMaterial, grassMaterial, stoneMaterial, stoneGeometry, leavesMaterial, trunkMaterial, noiseTexture, alphaMap])

    // Handle radius animation
    const handleRadiusAnimation = () => {
        const targetRadius = borderParameters.circleRadiusFactor
        const startRadius = 0.2

        // Kill previous animation if it exists
        if (radiusAnimationRef.current) {
            radiusAnimationRef.current.kill()
            radiusAnimationRef.current = null
        }

        // Set initial radius to 0.2
        terrainMaterial.uniforms.uCircleRadiusFactor.value = startRadius
        grassMaterial.uniforms.uCircleRadiusFactor.value = startRadius
        stoneMaterial.uniforms.uCircleRadiusFactor.value = startRadius

        // Create animation object for GSAP to animate
        const radiusObj = { value: startRadius }

        // Animate radius from 0.2 to target value
        radiusAnimationRef.current = gsap.to(radiusObj, {
            value: targetRadius,
            duration: 1.2,
            ease: 'power2.out',
            onUpdate: () => {
                // Update both materials' circle radius factor
                terrainMaterial.uniforms.uCircleRadiusFactor.value = radiusObj.value
                grassMaterial.uniforms.uCircleRadiusFactor.value = radiusObj.value
                stoneMaterial.uniforms.uCircleRadiusFactor.value = radiusObj.value
            },
            onComplete: () => {
                radiusAnimationRef.current = null
            },
        })
    }

    // Listen for game start trigger from Loader
    useEffect(() => {
        // Only trigger when it changes from false to true
        if (phase === PHASES.start && prevPhaseRef.current !== PHASES.start) {
            handleRadiusAnimation()
        }
        // Update the ref to track the current value
        prevPhaseRef.current = phase
    }, [phase, borderParameters, terrainMaterial, grassMaterial, setBorderParameters])

    // Cleanup animations on unmount
    useEffect(() => {
        return () => {
            if (radiusAnimationRef.current) {
                radiusAnimationRef.current.kill()
                radiusAnimationRef.current = null
            }
        }
    }, [])

    useFrame(({ clock }) => {
        const state = useStore.getState()
        // Update terrain material uniforms
        terrainMaterial.uniforms.uCircleCenter.value.copy(state.smoothedCircleCenter)

        // Update grass material uniforms
        grassMaterial.uniforms.uTime.value = clock.elapsedTime
        grassMaterial.uniforms.uTrailTexture.value = state.trailTexture
        grassMaterial.uniforms.uBallPosition.value.copy(state.ballPosition)
        grassMaterial.uniforms.uCircleCenter.value.copy(state.smoothedCircleCenter)

        // Update stones uniforms (no rerenders required)
        stoneMaterial.uniforms.uCircleCenter.value.copy(state.smoothedCircleCenter)

        // Update tree leaves material uniforms
        if (leavesMaterial?.uniforms?.uTime) {
            leavesMaterial.uniforms.uTime.value = clock.elapsedTime
        }
        if (leavesMaterial?.uniforms?.uCircleCenter) {
            leavesMaterial.uniforms.uCircleCenter.value.copy(state.smoothedCircleCenter)
        }
        if (trunkMaterial?.uniforms?.uCircleCenter) {
            trunkMaterial.uniforms.uCircleCenter.value.copy(state.smoothedCircleCenter)
        }

        // Chunk management
        const ballPosition = state.ballPosition
        const safeChunkSize = Math.max(0.0001, chunkSize)
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

    return (
        <group>
            {activeChunks.map((chunk) => (
                <TerrainChunk
                    key={chunk.key}
                    x={chunk.x}
                    z={chunk.z}
                    size={chunkSize}
                    noise2D={noise2D}
                    noiseTexture={noiseTexture}
                    terrainMaterial={terrainMaterial}
                    grassMaterial={grassMaterial}
                    stoneMaterial={stoneMaterial}
                    stoneGeometry={stoneGeometry}
                    leavesMaterial={leavesMaterial}
                    trunkMaterial={trunkMaterial}
                    treeScene={treeModel.scene}
                />
            ))}
        </group>
    )
}

useGLTF.preload(treeUrl)
