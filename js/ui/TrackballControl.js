import * as THREE from 'three';
import { eventBus } from '../../js/events.js';
import { interpretTrackballGesture } from '../../js/shotControls/TrackballGesture.js';

export class TrackballControl {
    constructor(containerId, canvasHostId, powerPreviewId) {
        this.container = document.getElementById(containerId);
        this.canvasHost = document.getElementById(canvasHostId);
        this.powerPreview = document.getElementById(powerPreviewId);
        this.points = [];
        this.dragging = false;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.ball = null;

        this.initScene();
        this.setupPointerEvents();
        this.animate();
    }

    initScene() {
        if (!this.canvasHost) return;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        this.camera.position.set(0, 0, 5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(150, 150);
        this.canvasHost.appendChild(this.renderer.domElement);

        const light = new THREE.DirectionalLight(0xffffff, 1.5);
        light.position.set(3, 5, 4);
        this.scene.add(light);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

        const geometry = new THREE.SphereGeometry(1.25, 48, 48);
        const material = new THREE.MeshStandardMaterial({
            color: 0xfff1c2,
            roughness: 0.35,
            metalness: 0.05
        });
        this.ball = new THREE.Mesh(geometry, material);
        this.scene.add(this.ball);
    }

    setupPointerEvents() {
        if (!this.container) return;

        this.container.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
        this.container.addEventListener('pointermove', (event) => this.handlePointerMove(event));
        this.container.addEventListener('pointerup', (event) => this.handlePointerUp(event));
        this.container.addEventListener('pointercancel', () => this.resetGesture());
    }

    getPoint(event) {
        return {
            x: event.clientX,
            y: event.clientY,
            t: Date.now()
        };
    }

    handlePointerDown(event) {
        event.preventDefault();
        this.dragging = true;
        this.points = [this.getPoint(event)];
        this.container.setPointerCapture(event.pointerId);
        this.updatePowerPreview(0);
    }

    handlePointerMove(event) {
        if (!this.dragging) return;

        event.preventDefault();
        const point = this.getPoint(event);
        const previous = this.points[this.points.length - 1];
        this.points.push(point);

        if (this.ball && previous) {
            this.ball.rotation.x += (previous.y - point.y) * 0.02;
            this.ball.rotation.z += (point.x - previous.x) * 0.02;
        }

        const result = interpretTrackballGesture(this.points);
        this.updatePowerPreview(result.valid ? result.intent.power : 0);
    }

    handlePointerUp(event) {
        if (!this.dragging) return;

        event.preventDefault();
        this.points.push(this.getPoint(event));
        const result = interpretTrackballGesture(this.points);
        this.resetGesture();

        if (result.valid) {
            eventBus.emit('trackballShotRequested', result.intent);
        }
    }

    resetGesture() {
        this.dragging = false;
        this.points = [];
        this.updatePowerPreview(0);
    }

    reset() {
        this.resetGesture();
    }

    updatePowerPreview(power) {
        if (this.powerPreview) {
            this.powerPreview.textContent = `Power ${Math.round(power * 100)}%`;
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    show() {
        if (this.container) this.container.style.display = 'block';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
        this.reset();
    }
}
