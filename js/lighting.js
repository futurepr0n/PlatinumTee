const LIGHT_OFFSET = Object.freeze({ x: 10, y: 20, z: 10 });

function followShadowLight(light, position) {
    if (!light) return;

    light.position.set(position.x + LIGHT_OFFSET.x, LIGHT_OFFSET.y, position.z + LIGHT_OFFSET.z);
    light.target.position.set(position.x, 0, position.z);
    light.target.updateMatrixWorld();
}

export { followShadowLight };
