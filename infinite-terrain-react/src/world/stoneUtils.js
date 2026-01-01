import * as THREE from 'three'

export function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export function smoothstep(edge0, edge1, x) {
    const e0 = edge0
    const e1 = edge1
    const denom = Math.max(1e-8, e1 - e0)
    let t = (x - e0) / denom
    t = Math.max(0, Math.min(1, t))
    return t * t * (3 - 2 * t)
}

// Deterministically generate stones for a single chunk
export function generateChunkStones(
    chunkX, // index
    chunkZ, // index
    size,
    noise2D,
    stoneParameters,
    terrainParameters
) {
    // Return minimal structure if invalid
    if (!stoneParameters.enabled || !noise2D) return { instances: [], stones: [] }

    const maxCount = Math.max(0, Math.floor(stoneParameters.count))
    if (maxCount === 0) return { instances: [], stones: [] }

    const chunkWorldX = chunkX * size
    const chunkWorldZ = chunkZ * size

    const cells = 8
    const cellSize = size / cells

    const candidates = []

    for (let ix = 0; ix < cells; ix++) {
        for (let iz = 0; iz < cells; iz++) {
            const seed = ((chunkX * 73856093) ^ (chunkZ * 19349663) ^ (ix * 83492791) ^ (iz * 2971215073)) >>> 0
            const rng = mulberry32(seed)

            const cx = -size * 0.5 + (ix + 0.5) * cellSize
            const cz = -size * 0.5 + (iz + 0.5) * cellSize

            // Local position within the chunk
            const localX = cx + (rng() - 0.5) * cellSize * 0.85
            const localZ = cz + (rng() - 0.5) * cellSize * 0.85

            const worldX = localX + chunkWorldX
            const worldZ = localZ + chunkWorldZ

            const n = noise2D(worldX * stoneParameters.noiseScale, worldZ * stoneParameters.noiseScale)
            const n01 = (n + 1) * 0.5
            if (n01 < stoneParameters.noiseThreshold) continue

            // Score defines ordering
            const score = n01 + rng() * 0.2

            candidates.push({
                score,
                localX,
                localZ,
                seed,
            })
        }
    }

    candidates.sort((a, b) => b.score - a.score)
    const chosen = candidates.slice(0, maxCount)

    const instances = []
    const stones = []
    const dummy = new THREE.Object3D()

    for (const c of chosen) {
        const rng = mulberry32(c.seed ^ 0x1234567)

        const worldX = c.localX + chunkWorldX
        const worldZ = c.localZ + chunkWorldZ
        const y = noise2D(worldX * terrainParameters.scale, worldZ * terrainParameters.scale) * terrainParameters.amplitude

        const baseScale = THREE.MathUtils.lerp(stoneParameters.minScale, stoneParameters.maxScale, rng())
        const yScale = baseScale * THREE.MathUtils.lerp(0.55, 0.95, rng())

        const centerY = y + stoneParameters.yOffset + yScale * 0.25
        const rotY = rng() * Math.PI * 2

        dummy.position.set(c.localX, centerY, c.localZ)
        dummy.rotation.y = rotY
        dummy.scale.set(baseScale, yScale, baseScale)
        dummy.updateMatrix()

        instances.push({ matrix: dummy.matrix.clone() })

        // Store stone center + scales for grass suppression (chunk-local space)
        stones.push({ x: c.localX, y: centerY, z: c.localZ, rx: baseScale, ry: yScale, rotY })
    }

    return { instances, stones }
}
