import * as THREE from 'three';
import { eventBus } from '../../js/events.js';
import { interpretTrackballGesture } from '../../js/shotControls/TrackballGesture.js';

const TRACKBALL_SIZE = 180;
const SPIN_DAMPING = 0.9;
const SPIN_INPUT_SCALE = 0.009;

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
        this.ballMaterial = null;
        this.chargeRing = null;
        this.finishTimer = null;
        this.spinVelocity = new THREE.Vector2();
        this.heft = 0;
        this.lastFrameTime = performance.now();
        this.animationFrame = null;

        this.initScene();
        this.setupPointerEvents();
    }

    initScene() {
        if (!this.canvasHost) return;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        this.camera.position.set(0, 0, 5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(TRACKBALL_SIZE, TRACKBALL_SIZE);
        this.canvasHost.appendChild(this.renderer.domElement);

        const light = new THREE.DirectionalLight(0xffffff, 1.5);
        light.position.set(3, 5, 4);
        this.scene.add(light);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

        const shadow = new THREE.Mesh(
            new THREE.CircleGeometry(1.45, 48),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
        );
        shadow.position.set(0, -1.28, -0.65);
        shadow.scale.set(1.15, 0.22, 1);
        this.scene.add(shadow);

        this.chargeRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.52, 0.035, 12, 96),
            new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.24 })
        );
        this.chargeRing.position.set(0, 0, -0.08);
        this.scene.add(this.chargeRing);

        const geometry = new THREE.SphereGeometry(1.1, 64, 64);
        this.ballMaterial = new THREE.MeshStandardMaterial({
            color: 0xfff1c2,
            emissive: 0x3a2400,
            emissiveIntensity: 0.08,
            roughness: 0.42,
            metalness: 0.04
        });
        this.ball = new THREE.Mesh(geometry, this.ballMaterial);
        this.scene.add(this.ball);

        const equator = new THREE.Mesh(
            new THREE.TorusGeometry(1.13, 0.018, 8, 96),
            new THREE.MeshBasicMaterial({ color: 0x7c5f2c, transparent: true, opacity: 0.35 })
        );
        equator.rotation.x = Math.PI / 2;
        this.ball.add(equator);

        const meridian = equator.clone();
        meridian.rotation.y = Math.PI / 2;
        this.ball.add(meridian);

        const crossMeridian = equator.clone();
        crossMeridian.rotation.x = Math.PI / 2;
        crossMeridian.rotation.y = Math.PI / 3;
        this.ball.add(crossMeridian);

        [
            [0.25, 0.45, 0.12],
            [1.35, -0.18, 0.09],
            [2.3, 0.28, 0.07],
            [3.4, -0.42, 0.11],
            [4.4, 0.12, 0.08],
            [5.35, -0.3, 0.1]
        ].forEach(([theta, phi, radius]) => this.addSurfaceMark(theta, phi, radius));
    }

    addSurfaceMark(theta, phi, radius) {
        if (!this.ball) return;

        const mark = new THREE.Mesh(
            new THREE.CircleGeometry(radius, 24),
            new THREE.MeshBasicMaterial({
                color: 0x5f4b26,
                transparent: true,
                opacity: 0.62,
                side: THREE.DoubleSide
            })
        );
        const sphereRadius = 1.115;
        const y = Math.sin(phi) * sphereRadius;
        const ringRadius = Math.cos(phi) * sphereRadius;

        mark.position.set(
            Math.cos(theta) * ringRadius,
            y,
            Math.sin(theta) * ringRadius
        );
        mark.lookAt(mark.position.clone().multiplyScalar(2));
        this.ball.add(mark);
    }

    setupPointerEvents() {
        if (!this.container) return;

        this.container.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
        this.container.addEventListener('pointermove', (event) => this.handlePointerMove(event));
        this.container.addEventListener('pointerup', (event) => this.handlePointerUp(event));
        this.container.addEventListener('pointerleave', (event) => this.handlePointerLeave(event));
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
        this.heft = 0.35;
        this.updatePowerPreview(0);
    }

    handlePointerMove(event) {
        if (!this.dragging) return;

        event.preventDefault();
        const point = this.getPoint(event);
        const previous = this.points[this.points.length - 1];
        this.points.push(point);

        if (this.ball && previous) {
            this.spinVelocity.x += (point.y - previous.y) * SPIN_INPUT_SCALE;
            this.spinVelocity.y += (point.x - previous.x) * SPIN_INPUT_SCALE;
        }

        const result = interpretTrackballGesture(this.points);
        this.updatePowerPreview(result.valid ? result.intent.power : 0);
        this.heft = result.valid ? Math.max(this.heft, result.intent.power) : this.heft;

        if (result.valid && this.isOutsideControl(point)) {
            this.finishGesture(point, false);
        } else if (result.valid) {
            this.scheduleFallbackFinish(point);
        }
    }

    handlePointerUp(event) {
        if (!this.dragging) return;

        event.preventDefault();
        this.finishGesture(this.getPoint(event));
    }

    handlePointerLeave(event) {
        if (!this.dragging) return;

        event.preventDefault();
        this.finishGesture(this.getPoint(event));
    }

    isOutsideControl(point) {
        if (!this.container) return false;

        const target = this.canvasHost || this.container;
        const rect = target.getBoundingClientRect();
        const margin = 32;
        return (
            point.x < rect.left - margin ||
            point.x > rect.right + margin ||
            point.y < rect.top - margin ||
            point.y > rect.bottom + margin
        );
    }

    scheduleFallbackFinish(point) {
        this.clearFallbackFinish();
        this.finishTimer = window.setTimeout(() => {
            if (this.dragging) this.finishGesture(point, false);
        }, 180);
    }

    clearFallbackFinish() {
        if (!this.finishTimer) return;

        window.clearTimeout(this.finishTimer);
        this.finishTimer = null;
    }

    finishGesture(point, appendPoint = true) {
        this.clearFallbackFinish();
        if (appendPoint) this.points.push(point);
        const result = interpretTrackballGesture(this.points);
        this.resetGesture();

        if (result.valid) {
            eventBus.emit('trackballShotRequested', result.intent);
        }
    }

    resetGesture() {
        this.clearFallbackFinish();
        this.dragging = false;
        this.points = [];
        this.heft = 0;
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
        this.animationFrame = requestAnimationFrame(() => this.animate());
        this.updateVisualPhysics();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    startLoop() {
        if (this.animationFrame !== null) return;
        this.lastFrameTime = performance.now();
        this.animate();
    }

    stopLoop() {
        if (this.animationFrame === null) return;
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
    }

    updateVisualPhysics() {
        if (!this.ball) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastFrameTime) / 16.67, 2);
        this.lastFrameTime = now;

        this.ball.rotation.x += this.spinVelocity.x * dt;
        this.ball.rotation.y += this.spinVelocity.y * dt;
        this.spinVelocity.multiplyScalar(Math.pow(SPIN_DAMPING, dt));

        if (this.ballMaterial) {
            this.ballMaterial.emissiveIntensity = 0.08 + this.heft * 0.16;
        }

        if (this.chargeRing) {
            const ringScale = 1 + this.heft * 0.1;
            this.chargeRing.scale.set(ringScale, ringScale, 1);
            this.chargeRing.material.opacity = 0.2 + this.heft * 0.35;
            this.chargeRing.rotation.z += 0.01 * dt;
        }
    }

    show() {
        if (this.container) this.container.style.display = 'block';
        this.startLoop();
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
        this.stopLoop();
        this.reset();
    }
}
