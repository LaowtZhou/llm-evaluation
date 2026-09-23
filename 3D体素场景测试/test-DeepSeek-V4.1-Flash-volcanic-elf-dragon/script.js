import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

const canvas = document.querySelector('#world-canvas');
const loading = document.querySelector('#scene-loading');
const fallback = document.querySelector('#scene-fallback');
const fullscreenButton = document.querySelector('#fullscreen-toggle');

let renderer;
let scene;
let camera;
let controls;
let world;
let largeDragon;
let wingLeft;
let wingRight;
let emberPoints;
let ashPoints;
let smokeClouds = [];
let lavaLights = [];
let time = 0;

const colors = {
  grass: 0x274f39,
  grass2: 0x356746,
  moss: 0x456e4b,
  dirt: 0x302827,
  basalt: 0x232d31,
  basaltLight: 0x465258,
  obsidian: 0x10171b,
  obsidianBlue: 0x1e343a,
  roof: 0x172d30,
  wood: 0x73503a,
  gold: 0xd6b96e,
  elf: 0xa6d7b9,
  elfDark: 0x2f6350,
  dragon: 0x6b3435,
  dragonPlate: 0xe0d4c1,
  wing: 0x76252b,
  wingGlow: 0xc03924,
  lava: 0xff4918,
  lavaHot: 0xffb347,
  ash: 0xc7cec1,
  magic: 0x77dfbb
};

const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .82, ...options });
const materials = {
  grass: mat(colors.grass), grass2: mat(colors.grass2), moss: mat(colors.moss), dirt: mat(colors.dirt), basalt: mat(colors.basalt), basaltLight: mat(colors.basaltLight), obsidian: mat(colors.obsidian, { metalness: .3, roughness: .64 }), obsidianBlue: mat(colors.obsidianBlue, { metalness: .26, roughness: .6 }), roof: mat(colors.roof), wood: mat(colors.wood), gold: mat(colors.gold, { metalness: .25, roughness: .42 }), elf: mat(colors.elf, { roughness: .62 }), elfDark: mat(colors.elfDark), dragon: mat(colors.dragon, { emissive: 0x4d0d0d, emissiveIntensity: 1.08, metalness: .3, roughness: .64 }), dragonPlate: mat(colors.dragonPlate, { metalness: .34, roughness: .48 }), wing: mat(colors.wing, { roughness: .78 }), wingGlow: mat(colors.wingGlow, { emissive: 0xe03218, emissiveIntensity: 3.2, roughness: .72 }), lava: mat(colors.lava, { emissive: colors.lava, emissiveIntensity: 1.6, roughness: .52 }), lavaHot: mat(colors.lavaHot, { emissive: 0xff5f0d, emissiveIntensity: 2.2, roughness: .4 }), magic: mat(colors.magic, { emissive: colors.magic, emissiveIntensity: 2.5, transparent: true, opacity: .84 }),
  smoke: mat(0x263137, { transparent: true, opacity: .13, depthWrite: false })
};

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const cube = (size, material, position, parent = world, scale = [1, 1, 1], castShadow = true) => {
  const mesh = new THREE.Mesh(boxGeometry, material);
  mesh.position.set(...position); mesh.scale.set(size * scale[0], size * scale[1], size * scale[2]); mesh.castShadow = castShadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
};

function seeded(x, z, salt = 0) { const value = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453; return value - Math.floor(value); }

function addVoxelBatch(name, material, transforms) {
  const mesh = new THREE.InstancedMesh(boxGeometry, material, transforms.length);
  const matrix = new THREE.Matrix4(); const scale = new THREE.Vector3(); const position = new THREE.Vector3();
  for (let i = 0; i < transforms.length; i += 1) { const item = transforms[i]; position.set(item[0], item[1], item[2]); scale.set(item[3] ?? 1, item[4] ?? 1, item[5] ?? 1); matrix.compose(position, new THREE.Quaternion(), scale); mesh.setMatrixAt(i, matrix); }
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; world.add(mesh); return mesh;
}

function buildTerrain() {
  const buckets = { grass: [], grass2: [], dirt: [], basalt: [], basaltLight: [] };
  for (let x = -17; x <= 17; x += 1) for (let z = -13; z <= 13; z += 1) {
    const radius = Math.sqrt((x / 17) ** 2 + (z / 13) ** 2); if (radius > 1.05) continue;
    const top = radius > .9 ? -.1 : (seeded(x, z) > .78 ? .35 : 0);
    const grassBucket = seeded(x, z, 2) > .7 ? buckets.grass2 : buckets.grass;
    grassBucket.push([x, top, z, 1.04, .58, 1.04]);
    buckets.dirt.push([x, top - .75, z, 1.02, .85, 1.02]);
    if (radius > .72 || seeded(x, z, 4) > .84) buckets[(seeded(x, z, 5) > .75) ? 'basaltLight' : 'basalt'].push([x, top - 1.55, z, 1.01, .78, 1.01]);
    if (radius > .9) buckets.basalt.push([x, top - 2.35, z, 1.02, .83, 1.02]);
    if (radius > .97 && seeded(x, z, 7) > .45) buckets.basalt.push([x, top - 3.15, z, 1.02, .88, 1.02]);
  }
  Object.entries(buckets).forEach(([name, transforms]) => addVoxelBatch(`terrain-${name}`, materials[name], transforms));
  const lava = [];
  for (let x = -15; x <= 15; x += 1) for (let z = -12; z <= 12; z += 1) {
    const stream = Math.abs(z - Math.sin(x * .35) * 1.7 - 1.2) < .46 && x < 5;
    const sideCrack = Math.abs(x + 5) < .38 && z > 2;
    if (stream || sideCrack) lava.push([x, .34, z, stream ? .86 : .32, .08, stream ? .42 : .75]);
  }
  addVoxelBatch('lava-rivers', materials.lava, lava);
}

function buildMountainBackdrop() {
  const mountain = [];
  for (let x = -27; x <= 27; x += 1) {
    const height = 5 + Math.floor((Math.sin(x * .47) + 1) * 2.6) + Math.floor(seeded(x, 12, 13) * 4);
    const centerZ = -18 - Math.abs(x % 3) * 1.7;
    for (let y = 0; y < height; y += 1) { const width = Math.max(1, Math.floor((height - y) * .65)); for (let z = centerZ - width; z <= centerZ + width; z += 1) mountain.push([x, y - .6, z, 1.04, 1.04, 1.04]); }
  }
  addVoxelBatch('far-mountain-range', materials.obsidianBlue, mountain);
  const ridge = [];
  for (let i = 0; i < 14; i += 1) { const x = -20 + i * 3.2; const h = 3 + Math.floor(seeded(i, 40, 4) * 5); for (let y = 0; y < h; y += 1) ridge.push([x, y - .3, -11, 2.4 - y * .12, 1.1, 1.3]); }
  addVoxelBatch('near-ridge', materials.basalt, ridge);
}

function buildCaldera() {
  const rim = [];
  for (let level = 0; level < 5; level += 1) {
    const radius = 7.4 - level * 1.18; const count = Math.floor(radius * 7);
    for (let i = 0; i < count; i += 1) { const angle = (i / count) * Math.PI * 2; const wobble = seeded(i, level, 19) * .32; rim.push([Math.cos(angle) * (radius + wobble), level * .72 + .18, Math.sin(angle) * (radius + wobble) - 1, .95, .78, .95]); }
  }
  addVoxelBatch('caldera-rim', materials.obsidian, rim);
  const hotRim = [];
  for (let i = 0; i < 30; i += 1) { const angle = (i / 30) * Math.PI * 2; hotRim.push([Math.cos(angle) * 5.25, 3.82, Math.sin(angle) * 5.25 - 1, .48, .1, .48]); }
  addVoxelBatch('caldera-hot-rim', materials.lavaHot, hotRim);
  const pool = [];
  for (let x = -5; x <= 5; x += 1) for (let z = -5; z <= 5; z += 1) if (x * x + z * z < 20) pool.push([x, 3.76, z - 1, 1.02, .1, 1.02]);
  addVoxelBatch('caldera-lava-pool', materials.lava, pool);
  for (let i = 0; i < 15; i += 1) cube(.48, materials.lavaHot, [Math.cos(i * 2.2) * 4.5, 4 + (i % 3) * .35, Math.sin(i * 2.2) * 4.5 - 1], world, [.6, .32, .6]);
}

function buildRuin(x, z, height = 4, scale = 1) {
  const ruin = new THREE.Group(); ruin.position.set(x, .35, z); ruin.scale.setScalar(scale); world.add(ruin);
  for (let y = 0; y < height; y += 1) { cube(.74, y % 3 === 0 ? materials.basaltLight : materials.obsidian, [0, y + .5, 0], ruin, [2.2, 1, 1.9]); if (y % 2 === 1) cube(.72, materials.obsidianBlue, [1.15, y + .5, -.28], ruin, [.55, 1, .55]); }
  cube(.8, materials.roof, [0, height + .18, 0], ruin, [2.55, .28, 2.2]); cube(.45, materials.lavaHot, [0, height - .1, -1.02], ruin, [.65, .7, .08]);
}

function buildTree(x, z, scale = 1) {
  const tree = new THREE.Group(); tree.position.set(x, .35, z); tree.scale.setScalar(scale); world.add(tree); cube(.3, materials.wood, [0, 1, 0], tree, [1, 3.8, 1]); cube(.72, materials.grass2, [0, 2.3, 0], tree, [2.2, 1.4, 2]); cube(.6, materials.moss, [.7, 2.55, .15], tree, [1.1, 1.25, 1.1]); cube(.56, materials.grass, [-.62, 2.6, -.18], tree, [1.05, 1.15, 1.2]);
}

function buildElf(position, scale = 1) {
  const elf = new THREE.Group(); elf.position.set(...position); elf.scale.setScalar(scale); world.add(elf);
  cube(.42, materials.elfDark, [0, .72, 0], elf, [1, 1.55, .82]); cube(.34, materials.elf, [0, 1.62, 0], elf, [1, 1, .92]); cube(.14, materials.elf, [-.26, 1.62, -.03], elf, [.6, .35, .24]); cube(.14, materials.elf, [.26, 1.62, -.03], elf, [.6, .35, .24]); cube(.46, materials.elfDark, [0, 1.98, 0], elf, [1.12, .22, 1.08]); cube(.18, materials.gold, [-.2, .04, 0], elf, [.62, .28, .62]); cube(.18, materials.gold, [.2, .04, 0], elf, [.62, .28, .62]);
  const spear = cube(.07, materials.gold, [.38, 1.35, -.18], elf, [.7, 7.7, .7]); spear.rotation.z = -.11; const bow = new THREE.Mesh(new THREE.TorusGeometry(.4, .035, 5, 8, Math.PI), materials.gold); bow.rotation.set(Math.PI / 2, 0, 0); bow.position.set(.35, 1.12, -.34); elf.add(bow);
}

function buildElfHost() {
  const formation = [[-8.2, .8, 2.9], [-7.25, .85, 2.1], [-6.25, .95, 2.95], [-5.2, .86, 2.15], [-4.05, .86, 2.85], [-3.1, .82, 2.25], [-8.55, .65, 4.1], [-7.4, .75, 3.8], [-6.2, .7, 4.25], [-5, .65, 3.7], [-3.9, .65, 4.25], [-2.8, .6, 3.65], [-9.2, .55, 5.2], [-8.1, .55, 5.05], [-7, .55, 5.4], [-5.8, .55, 5.05], [-4.6, .55, 5.35], [-3.4, .5, 4.95], [-2.2, .5, 5.25], [-1.1, .5, 4.95]];
  formation.forEach((pos, index) => buildElf(pos, 1.04 + (index % 3) * .08));
  const arrows = []; for (let i = 0; i < 18; i += 1) arrows.push([-7.4 + i * .42, 3.3 + Math.sin(i) * .14, 1.9 - i * .18, .06, .06, .7]); addVoxelBatch('elf-arrow-volley', materials.gold, arrows);
  buildTree(-10.5, 1.5, 1.15); buildTree(-11.2, 4.3, .9); buildTree(-5.4, 7.8, 1.12); buildRuin(-11.2, -3.7, 5, .92);
}

function buildHeroDragon(position, scale = 1) {
  const dragon = new THREE.Group(); dragon.position.set(...position); dragon.scale.setScalar(scale); dragon.rotation.y = .18; world.add(dragon);
  const part = (size, material, pos, scl = [1, 1, 1]) => cube(size, material, pos, dragon, scl);

  // A readable, front-facing silhouette: heavy chest, raised neck, square muzzle.
  part(1, materials.dragon, [0, 0, 0], [2.7, 1.45, 2.15]);
  part(.62, materials.wing, [0, .18, -1.05], [1.2, .72, .5]);
  part(.42, materials.lavaHot, [0, .08, -1.47], [1.25, .2, .12]);
  part(.52, materials.dragonPlate, [0, 1.05, .05], [1.1, 1.8, 1.12]);
  part(.46, materials.dragon, [0, 1.92, .36], [1.05, 1.35, .94]);
  part(.72, materials.dragonPlate, [0, 2.55, .72], [1.42, 1.05, 1.24]);
  part(.42, materials.dragon, [0, 2.3, 1.48], [1.8, .6, .92]);
  part(.2, materials.lavaHot, [0, 2.28, 1.98], [1.2, .16, .12]);
  [-.46, .46].forEach((side) => {
    part(.2, materials.lavaHot, [side, 2.72, 1.92], [.38, .3, .14]);
    part(.22, materials.dragonPlate, [side, 2.98, .62], [.3, 1.25, .34]);
    part(.18, materials.dragonPlate, [side * 1.18, 3.12, .36], [.25, 1.2, .24]);
  });
  for (let i = 0; i < 6; i += 1) part(.2, i % 2 ? materials.dragonPlate : materials.lavaHot, [0, 1.52 - i * .18, 1.08], [1.05 - i * .1, .25, .18]);
  part(.34, materials.dragonPlate, [0, 2.94, .03], [1.1, .38, .7]);
  part(.3, materials.dragon, [0, 2.2, 1.85], [1.3, .32, .38]);

  // Articulated legs and a stepped tail give the body weight instead of a floating bar.
  [-.82, .82].forEach((side) => {
    part(.42, materials.dragon, [side, -.98, -.62], [.68, 1.7, .78]);
    part(.34, materials.dragonPlate, [side, -1.62, .1], [.9, .35, 1.25]);
    part(.32, materials.dragon, [side, -.92, .72], [.64, 1.46, .68]);
  });
  for (let i = 0; i < 7; i += 1) part(.46, i % 2 ? materials.dragonPlate : materials.dragon, [0, -.28 - i * .1, 1.42 + i * .72], [1.5 - i * .12, .72 - i * .05, 1.05 - i * .09]);

  const wings = [];
  [-1, 1].forEach((side) => {
    const wing = new THREE.Group(); wing.position.set(0, .55, -.25); dragon.add(wing); wings.push(wing);
    cube(.42, materials.wing, [side * 2.05, 2.2, -.1], wing, [3.9, .8, .72]);
    cube(.32, materials.wing, [side * 2.72, 3.35, -.08], wing, [3.35, .55, .58]);
    for (let i = 0; i < 8; i += 1) {
      const x = side * (1.52 + i * .66); const y = 1.25 + i * .54;
      cube(.38, materials.wingGlow, [x, y, .05], wing, [2.1 - i * .14, .44, 1.32 - i * .1]);
      cube(.15, materials.dragonPlate, [side * (1.65 + i * .66), y + .08, .74], wing, [2.2 - i * .16, .16, .12]);
    }
    cube(.25, materials.wing, [side * 4.85, 5.15, .04], wing, [1.45, .48, 1.05]);
  });
  wingLeft = wings[0]; wingRight = wings[1];

  const breath = [];
  for (let i = 0; i < 34; i += 1) breath.push([0, 2.16 - i * .035, 2.22 + i * .3, .3 - i / 170, .26 - i / 210, .22 - i / 250]);
  addVoxelBatch('dragon-breath', materials.lavaHot, breath);
  largeDragon = dragon;
  return dragon;
}

function buildDragon(position, scale = 1, background = false) {
  if (!background) return buildHeroDragon(position, scale);
  const dragon = new THREE.Group(); dragon.position.set(...position); dragon.scale.setScalar(scale); if (!background) dragon.rotation.y = -.52; world.add(dragon);
  const part = (size, material, pos, scl = [1, 1, 1]) => cube(size, material, pos, dragon, scl);
  part(1, materials.dragon, [0, 0, 0], [3.1, 1.65, 1.7]); part(.9, materials.dragon, [-1.7, .35, 0], [1.45, 1.3, 1.4]); part(.74, materials.dragonPlate, [-2.55, .72, 0], [1.25, 1.05, 1.15]); part(.7, materials.dragon, [-3.28, .78, 0], [1.45, .82, 1]); part(.34, materials.dragonPlate, [-3.78, .82, -.24], [.62, .35, .35]); part(.34, materials.dragonPlate, [-3.78, .82, .24], [.62, .35, .35]);
  part(.18, materials.lavaHot, [-3.7, 1.02, -.49], [.38, .3, .16]); part(.18, materials.lavaHot, [-3.7, 1.02, .49], [.38, .3, .16]);
  part(.62, materials.dragonPlate, [-3.02, 1.5, 0], [1.18, 1.15, 1.18]);
  part(.38, materials.dragon, [-3.55, 1.42, 0], [1.35, .7, 1.05]);
  part(.42, materials.dragon, [-3.42, .98, 0], [1.45, .42, .92]);
  part(.18, materials.lavaHot, [-3.72, 1.02, -.42], [.8, .12, .12]);
  part(.18, materials.lavaHot, [-3.72, 1.02, .42], [.8, .12, .12]);
  part(.15, materials.lavaHot, [-3.48, 1.7, -.56], [.46, .24, .16]);
  part(.15, materials.lavaHot, [-3.48, 1.7, .56], [.46, .24, .16]);
  part(.28, materials.dragonPlate, [-3.08, 2.22, -.32], [.42, 1.15, .42]);
  part(.28, materials.dragonPlate, [-3.08, 2.22, .32], [.42, 1.15, .42]);
  part(.24, materials.dragonPlate, [-3.22, 2.62, -.42], [.42, 1.55, .34]);
  part(.24, materials.dragonPlate, [-3.22, 2.62, .42], [.42, 1.55, .34]);
  part(.34, materials.dragonPlate, [-3.62, 2.35, 0], [1.25, .62, .86]);
  part(.16, materials.dragon, [-4.18, 2.18, 0], [1.35, .42, .62]);
  part(.14, materials.lavaHot, [-4.42, 2.28, -.3], [.6, .28, .15]);
  part(.14, materials.lavaHot, [-4.42, 2.28, .3], [.6, .28, .15]);
  part(.18, materials.dragonPlate, [-3.78, 2.92, -.48], [.26, 1.2, .22]);
  part(.18, materials.dragonPlate, [-3.78, 2.92, .48], [.26, 1.2, .22]);
  part(.22, materials.lavaHot, [-3.1, 1.94, -.58], [.22, .2, .12]);
  part(.22, materials.lavaHot, [-3.1, 1.94, .58], [.22, .2, .12]);
  for (let i = 0; i < 7; i += 1) part(.5, i % 2 ? materials.dragonPlate : materials.dragon, [1.45 + i * .68, -.16 - i * .13, 0], [1.65 - i * .13, .72 - i * .06, .78 - i * .06]);
  [-.62, .62].forEach((z) => { part(.34, materials.dragon, [-1.05, -1.05, z], [.62, 1.5, .66]); part(.34, materials.dragon, [.92, -.98, z], [.62, 1.42, .66]); });
  [-1, 1].forEach((side) => {
    const wing = new THREE.Group(); wing.position.set(.1, .65, side * .7); dragon.add(wing);
    for (let i = 0; i < 7; i += 1) {
      const span = 1.15 - i * .07;
      const feather = cube(.27, background ? materials.wing : materials.wingGlow, [.35 + i * .7, 1.05 + i * .43, side * (1.1 + i * .34)], wing, [2.2 - i * .16, .34, span]);
      feather.rotation.y = side * .05;
      cube(.14, materials.dragonPlate, [.38 + i * .7, 1.08 + i * .43, side * (1.18 + i * .34)], wing, [2.4 - i * .18, .12, .12]);
    }
    if (!background) for (let i = 0; i < 6; i += 1) {
      cube(.32, materials.wing, [-.35 + i * .38, 1.7 + i * .58, side * (1.35 + i * .42)], wing, [1.25 - i * .1, .52, 1.35 - i * .13]);
    }
    cube(.18, materials.dragonPlate, [2.1, .1, side * 2.15], wing, [4.4, .22, .2]);
    if (!background) { if (side === -1) wingLeft = wing; else wingRight = wing; }
  });
  for (let i = 0; i < (background ? 3 : 10); i += 1) part(.22, materials.dragonPlate, [-1.4 + i * .55, 1.18 + Math.sin(i) * .08, 0], [.6, .8, .6]);
  if (!background) {
    const breath = []; for (let i = 0; i < 40; i += 1) breath.push([-4.2 - (i / 40) * 6.5, .92 + Math.sin(i * 1.7) * .26, (Math.random() - .5) * (0.35 + i / 50), .22 - i / 240, .22 - i / 260, .22 - i / 260]); addVoxelBatch('dragon-breath', materials.lavaHot, breath);
    largeDragon = dragon;
  }
  return dragon;
}

function buildSkyAndParticles() {
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 20), new THREE.MeshBasicMaterial({ color: 0xcde2d1 })); moon.position.set(-24, 22, -52); scene.add(moon);
  const starPositions = new Float32Array(900 * 3); for (let i = 0; i < 900; i += 1) { starPositions[i * 3] = (Math.random() - .5) * 60; starPositions[i * 3 + 1] = Math.random() * 25 + 2; starPositions[i * 3 + 2] = -Math.random() * 34 - 7; }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3)); scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xd1e4d4, size: .055, transparent: true, opacity: .78 })));
  const emberPositions = new Float32Array(900 * 3); for (let i = 0; i < 900; i += 1) { emberPositions[i * 3] = (Math.random() - .5) * 28; emberPositions[i * 3 + 1] = Math.random() * 13 - 1; emberPositions[i * 3 + 2] = (Math.random() - .5) * 22; }
  const emberGeometry = new THREE.BufferGeometry(); emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3)); emberPoints = new THREE.Points(emberGeometry, new THREE.PointsMaterial({ color: 0xffa54d, size: .1, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(emberPoints);
  const ashPositions = new Float32Array(520 * 3); for (let i = 0; i < 520; i += 1) { ashPositions[i * 3] = (Math.random() - .5) * 40; ashPositions[i * 3 + 1] = Math.random() * 18; ashPositions[i * 3 + 2] = (Math.random() - .5) * 30; }
  const ashGeometry = new THREE.BufferGeometry(); ashGeometry.setAttribute('position', new THREE.BufferAttribute(ashPositions, 3)); ashPoints = new THREE.Points(ashGeometry, new THREE.PointsMaterial({ color: colors.ash, size: .07, transparent: true, opacity: .42 })); scene.add(ashPoints);
  for (let i = 0; i < 24; i += 1) { const smoke = new THREE.Mesh(new THREE.DodecahedronGeometry(.45 + Math.random() * .5, 0), materials.smoke); smoke.position.set(-2 + Math.random() * 5, 4.3 + i * .36, -1 + (Math.random() - .5) * 1.2); smoke.scale.y = 1.2 + Math.random(); smokeClouds.push(smoke); scene.add(smoke); }
}

function init() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x071018); scene.fog = new THREE.FogExp2(0x071016, .009);
  camera = new THREE.PerspectiveCamera(47, 1, .1, 160); camera.position.set(31, 19, 43);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8)); renderer.setSize(window.innerWidth, window.innerHeight, false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18; renderer.outputColorSpace = THREE.SRGBColorSpace;
  controls = new OrbitControls(camera, canvas); controls.target.set(0, 3.7, -1); controls.enableDamping = true; controls.dampingFactor = .045; controls.enablePan = true; controls.screenSpacePanning = true; controls.minDistance = 8; controls.maxDistance = 88; controls.minPolarAngle = .08; controls.maxPolarAngle = Math.PI - .08; controls.autoRotate = true; controls.autoRotateSpeed = .18; controls.addEventListener('start', () => { controls.autoRotate = false; });
  scene.add(new THREE.HemisphereLight(0x9dc8bb, 0x160c0e, 1.8)); const moonLight = new THREE.DirectionalLight(0xb9e0d1, 3.8); moonLight.position.set(-18, 25, 18); moonLight.castShadow = true; moonLight.shadow.mapSize.set(2048, 2048); moonLight.shadow.camera.left = -30; moonLight.shadow.camera.right = 30; moonLight.shadow.camera.top = 30; moonLight.shadow.camera.bottom = -30; scene.add(moonLight);
  const coldRim = new THREE.PointLight(0x6bb7ad, 10, 25, 2); coldRim.position.set(-9, 10, 6); scene.add(coldRim); const dragonFill = new THREE.PointLight(0x8cc0b0, 28, 34, 2); dragonFill.position.set(4, 14, 5); scene.add(dragonFill); const fire = new THREE.PointLight(0xff5c1e, 12, 24, 2); fire.position.set(0, 5, -1); scene.add(fire); lavaLights.push(fire); const fire2 = new THREE.PointLight(0xff8d3a, 8, 18, 2); fire2.position.set(6, 5, -2); scene.add(fire2); lavaLights.push(fire2);
  world = new THREE.Group(); world.position.y = -1.35; scene.add(world);
  buildMountainBackdrop(); buildTerrain(); buildCaldera(); buildElfHost(); buildDragon([1.2, 7.1, -2.3], 2.15); buildDragon([-8.5, 9.3, -13], .58, true); buildDragon([13.5, 10.5, -17], .48, true); buildSkyAndParticles();
  window.addEventListener('resize', resize); canvas.addEventListener('dblclick', resetCamera); fullscreenButton.addEventListener('click', toggleFullscreen); loading.classList.add('is-hidden'); animate();
}

function resize() { renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
function resetCamera() { camera.position.set(31, 19, 43); controls.target.set(0, 3.7, -1); controls.autoRotate = true; }
window.__resetVoxelScene = resetCamera;
function toggleFullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }

function animate() {
  requestAnimationFrame(animate); time += .016;
  if (largeDragon) { largeDragon.position.y = 8 + Math.sin(time * 1.15) * .18; largeDragon.rotation.z = Math.sin(time * .8) * .018; if (wingLeft) wingLeft.rotation.x = Math.sin(time * 2.2) * .08; if (wingRight) wingRight.rotation.x = -Math.sin(time * 2.2) * .08; }
  smokeClouds.forEach((smoke, index) => { smoke.position.y += .0018 + index * .00004; smoke.rotation.x += .001; smoke.rotation.z -= .0007; if (smoke.position.y > 15) smoke.position.y = 4.3; });
  if (emberPoints) { emberPoints.rotation.y += .0006; emberPoints.position.y = Math.sin(time * .6) * .12; } if (ashPoints) { ashPoints.rotation.y -= .00022; ashPoints.position.x = Math.sin(time * .12) * .8; }
  lavaLights.forEach((light, index) => { light.intensity = (index ? 12 : 20) + Math.sin(time * (index + 3) * 1.3) * 2.8; }); controls.update(); renderer.render(scene, camera);
}

try { if (!window.WebGLRenderingContext) throw new Error('WebGL unavailable'); init(); } catch (error) { loading.classList.add('is-hidden'); fallback.classList.add('is-visible'); console.error(error); }
