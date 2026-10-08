function disposeResource(resource, shared) {
    if (resource && !shared.has(resource) && typeof resource.dispose === 'function') {
        resource.dispose();
    }
}

function disposeObject(scene, object, shared = new Set()) {
    if (!object) return;

    scene.remove(object);
    disposeResource(object.geometry, shared);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => disposeResource(material, shared));
}

export { disposeObject };
