import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => THREE.MathUtils.clamp(x, a, b);
export const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
export const v3 = (a) => new THREE.Vector3(...a);
