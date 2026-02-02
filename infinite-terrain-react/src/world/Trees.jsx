import React from 'react'
import { Tree } from './Tree.jsx'

export default function Trees({ trees, leavesMaterial, trunkMaterial, treeScene }) {
    if (!trees || trees.length === 0) return null
    return trees.map((tree, index) => (
        <Tree
            key={tree.id ?? index}
            position={tree.position}
            rotation={tree.rotation}
            scale={tree.scale}
            seed={tree.seed}
            leavesMaterial={leavesMaterial}
            trunkMaterial={trunkMaterial}
            treeScene={treeScene}
        />
    ))
}
