import { Physics } from '@react-three/rapier'
import { Perf } from 'r3f-perf'

import Lights from './Lights.jsx'
import Ball from './Ball.jsx'
import { Tree } from './Tree.jsx'
import Terrain from './Terrain.jsx'
import BallTrailCanvas from './BallTrailCanvas.jsx'
import Controls from './Controls.jsx'
import BackgroundSphere from './BackgroundSphere.jsx'
import useStore from '../stores/useStore.jsx'

export default function Experience() {
    const perfVisible = useStore((state) => state.perfVisible)
    const physicsDebug = useStore((state) => state.physicsDebug)
    const backgroundColor = useStore((state) => state.terrainParameters.backgroundColor)

    return (
        <>
            <color args={[backgroundColor]} attach="background" />

            {perfVisible && <Perf position="top-left" />}

            <Physics debug={physicsDebug}>
                <Lights />
                <Tree position={[2, 0, 0]} />
                <Terrain />
                <Ball />
            </Physics>

            <BallTrailCanvas />
            <Controls />
            <BackgroundSphere color={backgroundColor} />
        </>
    )
}
