import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import GUI from 'lil-gui';

// Scene Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance
renderer.toneMapping = THREE.ReinhardToneMapping;
document.querySelector('#app').appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Starfield
const starGeometry = new THREE.BufferGeometry();
const starCount = 5000;
const starPositions = new Float32Array(starCount * 3);

for (let i = 0; i < starCount; i++) {
    const x = (Math.random() - 0.5) * 100;
    const y = (Math.random() - 0.5) * 100;
    const z = (Math.random() - 0.5) * 100;
    starPositions[i * 3] = x;
    starPositions[i * 3 + 1] = y;
    starPositions[i * 3 + 2] = z;
}

starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05 });
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// Black Hole
const blackHoleGeometry = new THREE.SphereGeometry(1, 64, 64);
const blackHoleMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
const blackHole = new THREE.Mesh(blackHoleGeometry, blackHoleMaterial);
scene.add(blackHole);

// Custom Lensing Shader
const LensingShader = {
    uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uMass: { value: 0.02 }, // Lower default mass
        uRadius: { value: 0.05 } // Event horizon radius in UV
    },
    vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform float uMass;
    uniform float uRadius;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 diff = uv - uCenter;
      
      // Aspect ratio correction
      float aspect = uResolution.x / uResolution.y;
      diff.x *= aspect;
      
      float dist = length(diff);
      float rSq = dist * dist;
      
      // Avoid singularity
      if (dist < uRadius) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      
      // Gravitational Lensing: deflection ~ 1/r
      // Displacement in UV space
      // offset = (uMass / rSq) * diff
      
      vec2 offset = diff * (uMass / max(rSq, 0.0001));
      
      // Correct aspect ratio back for offset
      offset.x /= aspect;
      
      vec2 distortedUV = uv - offset;
      
      gl_FragColor = texture2D(tDiffuse, distortedUV);
    }
  `
};

const lensingPass = new ShaderPass(LensingShader);
lensingPass.enabled = true;

// Accretion Disk
const diskGeometry = new THREE.RingGeometry(1.5, 4.5, 128, 32); // Increased segments and radius
const diskMaterial = new THREE.ShaderMaterial({
    uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xffaa33) }
    },
    vertexShader: `
    varying vec2 vUv;
    varying vec3 vPos;
    void main() {
      vUv = uv;
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vPos;

    // Simplex 2D noise
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
               -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
      + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m ;
      m = m*m ;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    // FBM
    float fbm(vec2 st) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 0.0;
        for (int i = 0; i < 4; i++) {
            value += amplitude * snoise(st);
            st *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }

    void main() {
      // Polar coordinates
      float dist = length(vPos);
      float angle = atan(vPos.y, vPos.x);
      
      // Normalize distance for gradient
      float r = (dist - 1.5) / (4.5 - 1.5); // 0 to 1 across disk width
      
      // Base radial gradient (brighter near center)
      float radial = exp(-r * 3.0);
      
      // Spiral/Swirl effect using FBM
      // Rotate noise over time
      float rotation = uTime * 0.5;
      vec2 noiseUV = vec2(dist * 2.0 - uTime * 0.5, angle * 4.0 + dist * 2.0);
      
      float noiseVal = fbm(noiseUV);
      
      // Add "volumetric" layers by sampling noise at different scales/speeds
      float noiseVal2 = fbm(noiseUV * 1.5 + vec2(uTime * 0.2, 0.0));
      
      // Combine noise
      float clouds = smoothstep(-0.2, 0.8, noiseVal * 0.6 + noiseVal2 * 0.4);
      
      // Flares / Hotspots
      // Create bright spots that rotate
      float flareAngle = angle + uTime * 0.8;
      float flares = smoothstep(0.8, 1.0, sin(flareAngle * 3.0 + dist * 5.0) * snoise(vec2(angle, uTime)));
      
      // Combine all
      float intensity = radial * (0.3 + 0.7 * clouds);
      intensity += flares * 2.0 * radial; // Flares are very bright
      
      // Color mapping
      vec3 color = uColor * intensity;
      
      // Add a bit of blue shift for hotter inner areas
      color += vec3(0.2, 0.4, 1.0) * smoothstep(0.8, 1.0, 1.0 - r) * intensity;

      // Soft edges
      float alpha = smoothstep(0.0, 0.1, r) * smoothstep(1.0, 0.8, r);
      
      gl_FragColor = vec4(color, alpha * intensity);
    }
  `,
    side: THREE.DoubleSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const disk = new THREE.Mesh(diskGeometry, diskMaterial);
disk.rotation.x = Math.PI / 2;
scene.add(disk);

// Post-processing
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0;
bloomPass.strength = 1.5;
bloomPass.radius = 0;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(lensingPass);
composer.addPass(bloomPass);

// GUI
const gui = new GUI();
const params = {
    bloomStrength: 1.5,
    bloomRadius: 0,
    bloomThreshold: 0,
    diskSpeed: 0.2,
    diskColor: '#ffaa33',
    lensingMass: 0.02,
    lensingRadius: 0.05,
    resolution: 1.0,
    bloomEnabled: true,
    starsVisible: true
};

const bloomFolder = gui.addFolder('Bloom');
bloomFolder.add(params, 'bloomStrength', 0, 3).onChange(v => bloomPass.strength = v);
bloomFolder.add(params, 'bloomRadius', 0, 1).onChange(v => bloomPass.radius = v);
bloomFolder.add(params, 'bloomThreshold', 0, 1).onChange(v => bloomPass.threshold = v);

const diskFolder = gui.addFolder('Accretion Disk');
diskFolder.add(params, 'diskSpeed', 0, 2);
diskFolder.addColor(params, 'diskColor').onChange(v => disk.material.uniforms.uColor.value.set(v));

const lensingFolder = gui.addFolder('Lensing');
lensingFolder.add(params, 'lensingMass', 0, 0.1).onChange(v => lensingPass.uniforms.uMass.value = v);
lensingFolder.add(params, 'lensingRadius', 0, 0.5).onChange(v => lensingPass.uniforms.uRadius.value = v);

const perfFolder = gui.addFolder('Performance');
perfFolder.add(params, 'resolution', 0.1, 2.0).name('Resolution Scale').onChange(v => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * v);
    composer.setSize(window.innerWidth, window.innerHeight); // Composer needs re-size to pick up new pixel ratio? 
    // Actually setSize uses the renderer's pixel ratio if not specified, but here we might need to be explicit or just rely on renderer.
    // Let's just resize the renderer and composer.
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
perfFolder.add(params, 'bloomEnabled').name('Enable Bloom').onChange(v => {
    bloomPass.enabled = v;
});
perfFolder.add(params, 'starsVisible').name('Show Stars').onChange(v => {
    stars.visible = v;
});

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    lensingPass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);

    // Maintain resolution scale on resize
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * params.resolution);
});

// Info Panel Logic
const infoBtn = document.getElementById('info-btn');
const closeBtn = document.getElementById('close-btn');
const infoPanel = document.getElementById('info-panel');

infoBtn.addEventListener('click', () => {
    infoPanel.classList.add('open');
});

closeBtn.addEventListener('click', () => {
    infoPanel.classList.remove('open');
});

// Animation Loop
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now() * 0.001;
    disk.material.uniforms.uTime.value = time;
    disk.rotation.z += params.diskSpeed * 0.05;

    // Update Black Hole Screen Position for Lensing
    const vector = new THREE.Vector3(0, 0, 0); // Black hole is at 0,0,0
    vector.project(camera);

    // Convert NDC to UV (0 to 1)
    const x = (vector.x + 1) / 2;
    const y = (vector.y + 1) / 2;

    lensingPass.uniforms.uCenter.value.set(x, y);

    controls.update();
    composer.render();
}

animate();
