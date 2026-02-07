import { useState, useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, useGLTF } from '@react-three/drei'
import { createNoise2D } from 'simplex-noise'
import { gsap } from 'gsap'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import * as THREE from 'three'

import TerrainChunk from './TerrainChunk.jsx'
import { Tree } from './Tree.jsx'
import useStore from '../stores/useStore.jsx'
import usePhases, { PHASES } from '../stores/usePhases.jsx'
import { mulberry32 } from './utils/randomUtils.js'
import { generateChunkData } from './utils/chunkUtils.js'

import noiseTextureUrl from '/textures/noiseTexture.png'
import alphaLeavesUrl from '../assets/textures/alpha_leaves.png'
import treeUrl from '../assets/models/tree_physics.glb'

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
const TREE_POOL_SIZE = 18

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
    const ballFadeParameters = useStore((s) => s.ballFadeParameters)
    const ditheringParameters = useStore((s) => s.ditheringParameters)
    const setBorderParameters = useStore((s) => s.setBorderParameters)
    const terrainScale = terrainParameters.scale
    const terrainAmplitude = terrainParameters.amplitude
    const borderNoiseStrength = borderParameters.noiseStrength
    const borderNoiseScale = borderParameters.noiseScale
    const borderCircleRadius = borderParameters.circleRadiusFactor
    const borderGrassFadeOffset = borderParameters.grassFadeOffset
    const borderGroundOffset = borderParameters.groundOffset
    const borderGroundFadeOffset = borderParameters.groundFadeOffset
    const borderTreesMultiplier = borderParameters.borderTreesMultiplier
    const ditherModeValue = ditheringParameters.ditherMode === 'Bayer' ? 1 : 0
    const ballFadeRadius = ballFadeParameters.radius
    const ballFadeWidth = ballFadeParameters.width
    const ballFadeNoiseScale = ballFadeParameters.noiseScale
    const ballFadeNoiseStrength = ballFadeParameters.noiseStrength
    const ballFadeMax = ballFadeParameters.maxFade

    const noise2D = sharedNoise2D

    const treePoolStateRef = useRef({
        slots: Array.from({ length: TREE_POOL_SIZE }, () => ({ id: null, data: null })),
        map: new Map(),
    })

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
                uCircleRadiusFactor: { value: borderCircleRadius },
                uGrassFadeOffset: { value: borderGrassFadeOffset },
                uGroundOffset: { value: borderGroundOffset },
                uGroundFadeOffset: { value: borderGroundFadeOffset },
                uNoiseTexture: { value: noiseTexture },
                uNoiseStrength: { value: borderNoiseStrength },
                uNoiseScale: { value: borderNoiseScale },
                uPixelSize: { value: ditheringParameters.pixelSize },
                uDitherMode: { value: ditherModeValue }, // 0: Diamond, 1: Bayer
            },
            vertexShader: terrainVertexShader,
            fragmentShader: terrainFragmentShader,
        })
    }, [])

    // Grass material - shared across all chunks
    const grassMaterial = useMemo(
        () =>
            new THREE.ShaderMaterial({
                uniforms: {
                    uPixelSize: { value: ditheringParameters.pixelSize },
                    uDitherMode: { value: ditherModeValue }, // 0: Diamond, 1: Bayer
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
                    uNoiseStrength: { value: borderNoiseStrength },
                    uNoiseScale: { value: borderNoiseScale },
                    uCircleRadiusFactor: { value: borderCircleRadius },
                    uGrassFadeOffset: { value: borderGrassFadeOffset },
                    uGroundOffset: { value: borderGroundOffset },
                    uGroundFadeOffset: { value: borderGroundFadeOffset },
                },
                vertexShader: grassVertexShader,
                fragmentShader: grassFragmentShader,
                side: THREE.FrontSide,
            }),
        []
    )

    // Stone material - shared across all chunks
    const stoneMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uPixelSize: { value: ditheringParameters.pixelSize },
                uDitherMode: { value: ditherModeValue }, // 0: Diamond, 1: Bayer

                uStoneColor: { value: new THREE.Color(stoneParameters.color) },

                // Border fade (match grass)
                uCircleCenter: { value: new THREE.Vector3() },
                uChunkSize: { value: chunkSize },
                uNoiseTexture: { value: noiseTexture },
                uNoiseStrength: { value: borderNoiseStrength },
                uNoiseScale: { value: borderNoiseScale },
                uCircleRadiusFactor: { value: borderCircleRadius },
                uGrassFadeOffset: { value: borderGrassFadeOffset },
            },
            vertexShader: stonesVertexShader,
            fragmentShader: stonesFragmentShader,
            vertexColors: false,
            side: THREE.FrontSide,
        })
    }, [])

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
                uNoiseStrength: { value: borderNoiseStrength },
                uNoiseScale: { value: borderNoiseScale },
                uCircleRadiusFactor: { value: borderCircleRadius },
                uGrassFadeOffset: { value: borderGrassFadeOffset },
                uBorderTreesMultiplier: { value: borderTreesMultiplier },
                uBallPosition: { value: new THREE.Vector3() },
                uBallFadeRadius: { value: ballFadeRadius },
                uBallFadeWidth: { value: ballFadeWidth },
                uBallNoiseScale: { value: ballFadeNoiseScale },
                uBallNoiseStrength: { value: ballFadeNoiseStrength },
                uBallFadeMax: { value: ballFadeMax },
                uPixelSize: { value: ditheringParameters.pixelSize },
                uDitherMode: { value: ditherModeValue }, // 0: Diamond, 1: Bayer
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
    }, [])

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
                uNoiseStrength: { value: borderNoiseStrength },
                uNoiseScale: { value: borderNoiseScale },
                uCircleRadiusFactor: { value: borderCircleRadius },
                uGrassFadeOffset: { value: borderGrassFadeOffset },
                uBorderTreesMultiplier: { value: borderTreesMultiplier },
                uBallPosition: { value: new THREE.Vector3() },
                uBallFadeRadius: { value: ballFadeRadius },
                uBallFadeWidth: { value: ballFadeWidth },
                uBallNoiseScale: { value: ballFadeNoiseScale },
                uBallNoiseStrength: { value: ballFadeNoiseStrength },
                uBallFadeMax: { value: ballFadeMax },
                uPixelSize: { value: ditheringParameters.pixelSize },
                uDitherMode: { value: ditherModeValue }, // 0: Diamond, 1: Bayer
            },
            roughness: 1.0,
            metalness: 0.0,
        })
    }, [])

    const rigidBodyMaterial = useMemo(() => {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff })
        mat.visible = false
        return mat
    }, [])

    useEffect(() => {
        const u = terrainMaterial.uniforms
        u.uBaseColor.value.set(terrainParameters.color)
        u.uTrailPatchSize.value = chunkSize
        u.uCircleRadiusFactor.value = borderCircleRadius
        u.uGrassFadeOffset.value = borderGrassFadeOffset
        u.uGroundOffset.value = borderGroundOffset
        u.uGroundFadeOffset.value = borderGroundFadeOffset
        u.uNoiseTexture.value = noiseTexture
        u.uNoiseStrength.value = borderNoiseStrength
        u.uNoiseScale.value = borderNoiseScale
        u.uPixelSize.value = ditheringParameters.pixelSize
        u.uDitherMode.value = ditherModeValue
    }, [
        terrainMaterial,
        terrainParameters.color,
        chunkSize,
        borderCircleRadius,
        borderGrassFadeOffset,
        borderGroundOffset,
        borderGroundFadeOffset,
        noiseTexture,
        borderNoiseStrength,
        borderNoiseScale,
        ditheringParameters.pixelSize,
        ditherModeValue,
    ])

    useEffect(() => {
        const u = grassMaterial.uniforms
        u.uPixelSize.value = ditheringParameters.pixelSize
        u.uDitherMode.value = ditherModeValue
        u.uGrassSegments.value = grassParameters.segmentsCount
        u.uGrassChunkSize.value = chunkSize
        u.uGrassWidth.value = grassParameters.width
        u.uGrassHeight.value = grassParameters.height
        u.uGrassBaseColor.value.set(grassParameters.colorBase)
        u.uGrassTopColor.value.set(grassParameters.colorTop)
        u.uLeanFactor.value = grassParameters.leanFactor

        u.uFlowersEnabled.value = grassParameters.flowersEnabled ? 1.0 : 0.0
        u.uFlowerDensity.value = grassParameters.flowerDensity
        u.uFlowerNoiseScale.value = grassParameters.flowerNoiseScale
        u.uFlowerHeightBoost.value = grassParameters.flowerHeightBoost
        u.uFlowerTipStart.value = grassParameters.flowerTipStart
        u.uFlowerBaseScale.value = grassParameters.flowerBaseScale
        u.uFlowerExpand.value = grassParameters.flowerExpand
        u.uFlowerColorA.value.set(grassParameters.flowerColorA)
        u.uFlowerColorB.value.set(grassParameters.flowerColorB)
        u.uFlowerColorC.value.set(grassParameters.flowerColorC)
        u.uFlowerColorD.value.set(grassParameters.flowerColorD)

        u.uWindDirection.value = windParameters.direction
        u.uWindScale.value = windParameters.scale
        u.uWindStrength.value = windParameters.strength
        u.uWindSpeed.value = windParameters.speed
        u.uTrailCanvasSize.value = trailParameters.chunkSize
        u.uSobelMode.value = grassParameters.sobelMode

        u.uNoiseTexture.value = noiseTexture
        u.uNoiseStrength.value = borderNoiseStrength
        u.uNoiseScale.value = borderNoiseScale
        u.uCircleRadiusFactor.value = borderCircleRadius
        u.uGrassFadeOffset.value = borderGrassFadeOffset
        u.uGroundOffset.value = borderGroundOffset
        u.uGroundFadeOffset.value = borderGroundFadeOffset
    }, [
        grassMaterial,
        grassParameters,
        windParameters,
        trailParameters.chunkSize,
        chunkSize,
        noiseTexture,
        borderNoiseStrength,
        borderNoiseScale,
        borderCircleRadius,
        borderGrassFadeOffset,
        borderGroundOffset,
        borderGroundFadeOffset,
        ditheringParameters.pixelSize,
        ditherModeValue,
    ])

    useEffect(() => {
        const u = stoneMaterial.uniforms
        u.uPixelSize.value = ditheringParameters.pixelSize
        u.uDitherMode.value = ditherModeValue
        u.uStoneColor.value.set(stoneParameters.color)
        u.uChunkSize.value = chunkSize
        u.uNoiseTexture.value = noiseTexture
        u.uNoiseStrength.value = borderNoiseStrength
        u.uNoiseScale.value = borderNoiseScale
        u.uCircleRadiusFactor.value = borderCircleRadius
        u.uGrassFadeOffset.value = borderGrassFadeOffset
    }, [
        stoneMaterial,
        stoneParameters.color,
        chunkSize,
        noiseTexture,
        borderNoiseStrength,
        borderNoiseScale,
        borderCircleRadius,
        borderGrassFadeOffset,
        ditheringParameters.pixelSize,
        ditherModeValue,
    ])

    useEffect(() => {
        const u = leavesMaterial.uniforms
        u.uWiggleStrength.value = treeParameters.bushWiggleStrength
        u.uWiggleSpeed.value = treeParameters.bushWiggleSpeed
        u.uWorldNoiseScale.value = treeParameters.bushWorldNoiseScale
        u.uUvWiggleScale.value = treeParameters.bushUvWiggleScale
        u.uNoiseTexture.value = noiseTexture
        u.uNoiseMix.value = treeParameters.bushNoiseMix

        u.uFresnelPower.value = treeParameters.bushFresnelPower
        u.uFresnelStrength.value = treeParameters.bushFresnelStrength
        u.uFresnelColor.value.set(treeParameters.bushFresnelColor)

        u.uChunkSize.value = chunkSize
        u.uNoiseStrength.value = borderNoiseStrength
        u.uNoiseScale.value = borderNoiseScale
        u.uCircleRadiusFactor.value = borderCircleRadius
        u.uGrassFadeOffset.value = borderGrassFadeOffset
        u.uBorderTreesMultiplier.value = borderTreesMultiplier
        u.uBallFadeRadius.value = ballFadeRadius
        u.uBallFadeWidth.value = ballFadeWidth
        u.uBallNoiseScale.value = ballFadeNoiseScale
        u.uBallNoiseStrength.value = ballFadeNoiseStrength
        u.uBallFadeMax.value = ballFadeMax
        u.uPixelSize.value = ditheringParameters.pixelSize
        u.uDitherMode.value = ditherModeValue

        leavesMaterial.color.set(treeParameters.leavesColor)

        if (leavesMaterial.alphaMap !== alphaMap) {
            leavesMaterial.alphaMap = alphaMap
            leavesMaterial.needsUpdate = true
        }
        if (leavesMaterial.alphaTest !== treeParameters.bushAlphaTest) {
            leavesMaterial.alphaTest = treeParameters.bushAlphaTest
            leavesMaterial.needsUpdate = true
        }
    }, [
        leavesMaterial,
        treeParameters,
        chunkSize,
        noiseTexture,
        alphaMap,
        borderNoiseStrength,
        borderNoiseScale,
        borderCircleRadius,
        borderGrassFadeOffset,
        borderTreesMultiplier,
        ballFadeRadius,
        ballFadeWidth,
        ballFadeNoiseScale,
        ballFadeNoiseStrength,
        ballFadeMax,
        ditheringParameters.pixelSize,
        ditherModeValue,
    ])

    useEffect(() => {
        const u = trunkMaterial.uniforms
        u.uTrunkColorA.value.set(treeParameters.trunkColorA ?? '#ffffff')
        u.uTrunkColorB.value.set(treeParameters.trunkColorB ?? '#000000')
        u.uChunkSize.value = chunkSize
        u.uNoiseTexture.value = noiseTexture
        u.uNoiseStrength.value = borderNoiseStrength
        u.uNoiseScale.value = borderNoiseScale
        u.uCircleRadiusFactor.value = borderCircleRadius
        u.uGrassFadeOffset.value = borderGrassFadeOffset
        u.uBorderTreesMultiplier.value = borderTreesMultiplier
        u.uBallFadeRadius.value = ballFadeRadius
        u.uBallFadeWidth.value = ballFadeWidth
        u.uBallNoiseScale.value = ballFadeNoiseScale
        u.uBallNoiseStrength.value = ballFadeNoiseStrength
        u.uBallFadeMax.value = ballFadeMax
        u.uPixelSize.value = ditheringParameters.pixelSize
        u.uDitherMode.value = ditherModeValue
    }, [
        trunkMaterial,
        treeParameters.trunkColorA,
        treeParameters.trunkColorB,
        chunkSize,
        noiseTexture,
        borderNoiseStrength,
        borderNoiseScale,
        borderCircleRadius,
        borderGrassFadeOffset,
        borderTreesMultiplier,
        ballFadeRadius,
        ballFadeWidth,
        ballFadeNoiseScale,
        ballFadeNoiseStrength,
        ballFadeMax,
        ditheringParameters.pixelSize,
        ditherModeValue,
    ])

    // Cleanup materials and shared assets on unmount
    useEffect(() => {
        return () => {
            terrainMaterial.dispose()
            grassMaterial.dispose()
            stoneMaterial.dispose()
            stoneGeometry.dispose()
            leavesMaterial.dispose()
            trunkMaterial.dispose()
            rigidBodyMaterial.dispose()
            // Dispose shared textures when the entire terrain is gone
            noiseTexture.dispose()
            alphaMap.dispose()
        }
    }, [terrainMaterial, grassMaterial, stoneMaterial, stoneGeometry, leavesMaterial, trunkMaterial, rigidBodyMaterial, noiseTexture, alphaMap])

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
        if (leavesMaterial?.uniforms?.uBallPosition) {
            leavesMaterial.uniforms.uBallPosition.value.copy(state.ballPosition)
        }
        if (trunkMaterial?.uniforms?.uCircleCenter) {
            trunkMaterial.uniforms.uCircleCenter.value.copy(state.smoothedCircleCenter)
        }
        if (trunkMaterial?.uniforms?.uBallPosition) {
            trunkMaterial.uniforms.uBallPosition.value.copy(state.ballPosition)
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

    const treeTargets = useMemo(() => {
        if (!activeChunks || activeChunks.length === 0) return []

        const targets = []
        for (const chunk of activeChunks) {
            const { treeInstances } = generateChunkData(chunk.x, chunk.z, chunkSize, noise2D, stoneParameters, { scale: terrainScale, amplitude: terrainAmplitude })
            const originX = chunk.x * chunkSize
            const originZ = chunk.z * chunkSize

            for (const t of treeInstances) {
                targets.push({
                    id: t.id,
                    seed: t.seed,
                    position: [t.position[0] + originX, t.position[1], t.position[2] + originZ],
                    rotation: t.rotation,
                    scale: t.scale,
                })
            }
        }

        return targets
    }, [activeChunks, chunkSize, noise2D, stoneParameters, terrainScale, terrainAmplitude])

    const treePoolSlots = useMemo(() => {
        const pool = treePoolStateRef.current
        const nextIds = new Set(treeTargets.map((t) => t.id))

        for (let i = 0; i < pool.slots.length; i++) {
            const slot = pool.slots[i]
            if (slot.id && !nextIds.has(slot.id)) {
                pool.map.delete(slot.id)
                slot.id = null
                slot.data = null
            }
        }

        for (const target of treeTargets) {
            let slotIndex = pool.map.get(target.id)
            if (slotIndex === undefined) {
                slotIndex = pool.slots.findIndex((s) => s.id === null)
                if (slotIndex === -1) continue
                pool.map.set(target.id, slotIndex)
                pool.slots[slotIndex].id = target.id
            }
            pool.slots[slotIndex].data = target
        }

        return pool.slots.map((slot) => slot.data)
    }, [treeTargets])

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
                />
            ))}
            {treePoolSlots.map((tree, index) => {
                const visible = Boolean(tree)
                const position = tree?.position ?? [0, -9999, 0]
                const rotation = tree?.rotation ?? [0, 0, 0]
                const scale = tree?.scale ?? 1
                const seed = tree?.seed ?? 0

                return (
                    <Tree
                        key={`tree-pool-${index}`}
                        position={position}
                        rotation={rotation}
                        scale={scale}
                        seed={seed}
                        visible={visible}
                        leavesMaterial={leavesMaterial}
                        trunkMaterial={trunkMaterial}
                        rigidBodyMaterial={rigidBodyMaterial}
                        treeScene={treeModel.scene}
                    />
                )
            })}
        </group>
    )
}

useGLTF.preload(treeUrl)
