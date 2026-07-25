import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Capsule } from "three/addons/math/Capsule.js";
import { Octree } from "three/addons/math/Octree.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

window.__viewerBooted = true;

const MODEL_URL = "./assets/models/defense-base.glb?v=20260725-2";
const COLLISION_MODEL_URL = "./assets/models/defense-base-collision.glb";
const AR_MODEL_URL = "./assets/models/defense-base-ar.glb?v=20260725-2";
const PAGE_URL = "https://linkseinschlafen-dot.github.io/national-defense-education-base/";
const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

const app = document.querySelector("#app");
const canvas = document.querySelector("#scene-canvas");
const loadingScreen = document.querySelector("#loading-screen");
const progressBar = document.querySelector("#progress-bar");
const loadingMessage = document.querySelector("#loading-message");
const loadingPercent = document.querySelector("#loading-percent");
const errorScreen = document.querySelector("#error-screen");
const errorMessage = document.querySelector("#error-message");
const renderStatus = document.querySelector(".render-status");
const renderStatusText = document.querySelector("#render-status-text");
const modeDescription = document.querySelector("#mode-description");
const walkGuide = document.querySelector("#walk-guide");
const infoButton = document.querySelector("#info-button");
const infoPanel = document.querySelector("#info-panel");
const closeInfoButton = document.querySelector("#close-info-button");
const fullscreenButton = document.querySelector("#fullscreen-button");
const pointerLockPrompt = document.querySelector("#pointer-lock-prompt");
const resetPositionButton = document.querySelector("#reset-position-button");
const joystick = document.querySelector("#joystick");
const joystickThumb = document.querySelector("#joystick-thumb");
const arButton = document.querySelector("#ar-button");
const arLauncher = document.querySelector("#ar-launcher");
const arHelp = document.querySelector("#ar-help");
const closeArHelp = document.querySelector("#close-ar-help");
const copyLinkButton = document.querySelector("#copy-link-button");
const modeButtons = [...document.querySelectorAll("[data-mode-target]")];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x89918d);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.08, 500);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isCoarsePointer,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isCoarsePointer ? 1.45 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const environmentGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.03).texture;
environmentGenerator.dispose();

const hemisphereLight = new THREE.HemisphereLight(0xdce4df, 0x202722, 0.3);
scene.add(hemisphereLight);

const keyLight = new THREE.DirectionalLight(0xffdfbd, 1);
keyLight.position.set(38, 52, 22);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xa8c2ce, 0.18);
fillLight.position.set(-32, 22, -28);
scene.add(fillLight);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.07;
orbitControls.screenSpacePanning = false;
orbitControls.minPolarAngle = 0.22;
orbitControls.maxPolarAngle = Math.PI / 2.03;
orbitControls.zoomToCursor = true;

const worldOctree = new Octree();
const modelBounds = new THREE.Box3();
const modelCenter = new THREE.Vector3();
const modelSize = new THREE.Vector3();
const overviewPosition = new THREE.Vector3();
const spawnPosition = new THREE.Vector3();
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const upVector = new THREE.Vector3(0, 1, 0);
const raycaster = new THREE.Raycaster();
const playerCollider = new Capsule(
  new THREE.Vector3(0, 0.35, 0),
  new THREE.Vector3(0, 1.65, 0),
  0.35,
);

const keyState = Object.create(null);
const joystickVector = new THREE.Vector2();

let modelRoot = null;
let activeMode = "orbit";
let playerOnFloor = false;
let yaw = 0;
let pitch = 0;
let touchLookPointer = null;
let lastTouchLookX = 0;
let lastTouchLookY = 0;
let joystickPointer = null;
let arReady = false;
let previousFrameTime = performance.now();
let modelLoadTimeout = null;

function setLoadingProgress(percent, message) {
  const boundedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  progressBar.style.width = `${boundedPercent}%`;
  loadingPercent.textContent = `${boundedPercent}%`;
  if (message) loadingMessage.textContent = message;
}

function showLoadError(error) {
  if (modelLoadTimeout) {
    window.clearTimeout(modelLoadTimeout);
    modelLoadTimeout = null;
  }
  console.error(error);
  loadingScreen.hidden = true;
  errorScreen.hidden = false;
  errorMessage.textContent =
    "模型文件载入失败。请刷新页面；如果问题持续出现，请确认浏览器支持 WebGL。";
  renderStatusText.textContent = "载入失败";
}

function prepareOverviewCamera() {
  const horizontalSpan = Math.max(modelSize.x, modelSize.z);
  orbitControls.target.copy(modelCenter);
  orbitControls.target.y += modelSize.y * 0.06;
  overviewPosition.set(
    modelCenter.x + horizontalSpan * 0.86,
    modelBounds.max.y + horizontalSpan * 0.48,
    modelCenter.z + horizontalSpan * 1.02,
  );
  camera.position.copy(overviewPosition);
  camera.fov = 42;
  camera.updateProjectionMatrix();
  orbitControls.minDistance = 5;
  orbitControls.maxDistance = horizontalSpan * 3.2;
  orbitControls.update();
}

function findGroundAt(x, z) {
  raycaster.set(
    new THREE.Vector3(x, modelBounds.max.y + 4, z),
    new THREE.Vector3(0, -1, 0),
  );
  const hits = raycaster.intersectObject(modelRoot, true);
  return hits.length ? hits[0].point.y : modelBounds.min.y + 0.42;
}

function chooseSpawnPosition() {
  const preferredX = -25.4;
  const preferredZ = 20.4;
  const insideModelBounds =
    preferredX > modelBounds.min.x &&
    preferredX < modelBounds.max.x &&
    preferredZ > modelBounds.min.z &&
    preferredZ < modelBounds.max.z;

  const x = insideModelBounds ? preferredX : modelCenter.x;
  const z = insideModelBounds ? preferredZ : modelCenter.z;
  const groundY = findGroundAt(x, z);
  spawnPosition.set(x, groundY + 0.06, z);
}

function resetPlayerPosition() {
  const footY = spawnPosition.y;
  playerCollider.start.set(spawnPosition.x, footY + 0.35, spawnPosition.z);
  playerCollider.end.set(spawnPosition.x, footY + 1.65, spawnPosition.z);
  playerVelocity.set(0, 0, 0);
  yaw = 0;
  pitch = -0.03;
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  camera.position.copy(playerCollider.end);
}

function updateModeButtons(mode) {
  for (const button of modeButtons) {
    const isActive = button.dataset.modeTarget === mode;
    button.classList.toggle("is-active", isActive);
    if (button.hasAttribute("aria-pressed")) {
      button.setAttribute("aria-pressed", String(isActive));
    }
  }
}

function requestWalkPointerLock() {
  if (!isCoarsePointer && document.pointerLockElement !== canvas) {
    try {
      const pointerLockRequest = canvas.requestPointerLock?.();
      pointerLockRequest?.catch?.(() => {
        pointerLockPrompt.hidden = false;
      });
    } catch {
      pointerLockPrompt.hidden = false;
    }
  }
}

function setMode(mode) {
  if (!modelRoot || mode === activeMode) {
    if (mode === "walk") requestWalkPointerLock();
    return;
  }

  activeMode = mode;
  app.dataset.mode = mode;
  walkGuide.inert = mode !== "walk";
  updateModeButtons(mode);

  if (mode === "walk") {
    orbitControls.enabled = false;
    camera.fov = 68;
    camera.updateProjectionMatrix();
    resetPlayerPosition();
    modeDescription.textContent = "真实比例游览已启用。";
    pointerLockPrompt.hidden = isCoarsePointer;
    requestWalkPointerLock();
  } else {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    orbitControls.enabled = true;
    pointerLockPrompt.hidden = true;
    joystickVector.set(0, 0);
    joystickThumb.style.transform = "translate(-50%, -50%)";
    prepareOverviewCamera();
    modeDescription.textContent = "拖拽旋转场景，滚轮或双指缩放。";
  }
}

function playerCollisions() {
  const result = worldOctree.capsuleIntersect(playerCollider);
  playerOnFloor = false;

  if (!result) return;

  playerOnFloor = result.normal.y > 0.55;
  if (!playerOnFloor) {
    playerVelocity.addScaledVector(
      result.normal,
      -result.normal.dot(playerVelocity),
    );
  } else if (playerVelocity.y < 0) {
    playerVelocity.y = 0;
  }

  playerCollider.translate(result.normal.multiplyScalar(result.depth));
}

function getMovementInput() {
  let x = joystickVector.x;
  let y = -joystickVector.y;

  if (keyState.KeyW || keyState.ArrowUp) y += 1;
  if (keyState.KeyS || keyState.ArrowDown) y -= 1;
  if (keyState.KeyD || keyState.ArrowRight) x += 1;
  if (keyState.KeyA || keyState.ArrowLeft) x -= 1;

  return { x: THREE.MathUtils.clamp(x, -1, 1), y: THREE.MathUtils.clamp(y, -1, 1) };
}

function updatePlayer(delta) {
  let damping = Math.exp(-4.2 * delta) - 1;

  if (!playerOnFloor) {
    playerVelocity.y -= 25 * delta;
    damping *= 0.12;
  }

  playerVelocity.addScaledVector(playerVelocity, damping);

  const input = getMovementInput();
  moveVector.set(input.x, 0, -input.y);

  if (moveVector.lengthSq() > 0) {
    moveVector.normalize().applyAxisAngle(upVector, yaw);
    const sprinting = keyState.ShiftLeft || keyState.ShiftRight;
    const acceleration = playerOnFloor ? (sprinting ? 32 : 21) : 7;
    playerVelocity.addScaledVector(moveVector, acceleration * delta);
  }

  if (keyState.Space && playerOnFloor) {
    playerVelocity.y = 7.2;
    playerOnFloor = false;
  }

  playerDirection.copy(playerVelocity).multiplyScalar(delta);
  playerCollider.translate(playerDirection);
  playerCollisions();
  camera.position.copy(playerCollider.end);

  if (camera.position.y < modelBounds.min.y - 8) {
    resetPlayerPosition();
  }
}

function updateLook(deltaX, deltaY, sensitivity = 0.0022) {
  yaw -= deltaX * sensitivity;
  pitch -= deltaY * sensitivity;
  pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.06, Math.PI / 2 - 0.06);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
}

function updateJoystick(event) {
  const bounds = joystick.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const maxRadius = bounds.width * 0.33;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const length = Math.hypot(dx, dy);
  const scale = length > maxRadius ? maxRadius / length : 1;
  const limitedX = dx * scale;
  const limitedY = dy * scale;

  joystickVector.set(limitedX / maxRadius, limitedY / maxRadius);
  joystickThumb.style.transform =
    `translate(calc(-50% + ${limitedX}px), calc(-50% + ${limitedY}px))`;
}

function resetJoystick() {
  joystickPointer = null;
  joystickVector.set(0, 0);
  joystickThumb.style.transform = "translate(-50%, -50%)";
}

function toggleInfoPanel(forceOpen) {
  const shouldOpen =
    typeof forceOpen === "boolean" ? forceOpen : !infoPanel.classList.contains("is-open");
  infoPanel.classList.toggle("is-open", shouldOpen);
  infoPanel.inert = !shouldOpen;
  infoButton.setAttribute("aria-expanded", String(shouldOpen));
}

function handleArRequest() {
  if (arReady && arLauncher.canActivateAR) {
    arLauncher.activateAR();
    return;
  }
  arHelp.showModal();
}

function prepareArModel() {
  arButton.disabled = false;
  arButton.title = "AR 模型准备中";

  const markArReady = () => {
    arReady = true;
    arButton.title = "在支持的手机上进入 AR";
  };

  arLauncher.addEventListener("load", markArReady, { once: true });
  arLauncher.addEventListener(
    "error",
    () => {
      arButton.disabled = false;
      arButton.title = "查看手机 AR 打开方式";
    },
    { once: true },
  );
  arLauncher.setAttribute("src", AR_MODEL_URL);
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

function finishSceneSetup() {
  if (modelLoadTimeout) {
    window.clearTimeout(modelLoadTimeout);
    modelLoadTimeout = null;
  }
  chooseSpawnPosition();
  resetPlayerPosition();
  prepareOverviewCamera();

  document.querySelector('[data-mode-target="walk"]').disabled = false;
  renderStatus.classList.add("is-ready");
  renderStatusText.textContent = "场景就绪";
  setLoadingProgress(100, "场景准备完成");
  window.setTimeout(() => loadingScreen.classList.add("is-complete"), 280);
  window.setTimeout(prepareArModel, 450);
}

function loadCollisionModel() {
  const collisionLoader = new GLTFLoader();
  collisionLoader.setMeshoptDecoder(MeshoptDecoder);
  collisionLoader.load(
    COLLISION_MODEL_URL,
    (collisionGltf) => {
      setLoadingProgress(94, "正在建立步行碰撞");
      worldOctree.fromGraphNode(collisionGltf.scene);
      finishSceneSetup();
    },
    (event) => {
      if (!event.total) {
        setLoadingProgress(82, "正在载入步行空间");
        return;
      }
      setLoadingProgress(78 + (event.loaded / event.total) * 14, "正在载入步行空间");
    },
    showLoadError,
  );
}

modelLoadTimeout = window.setTimeout(() => {
  showLoadError(new Error("Model loading timed out after 120 seconds."));
}, 120000);

loader.load(
  MODEL_URL,
  (gltf) => {
    modelRoot = gltf.scene;
    modelRoot.traverse((child) => {
      if (!child.isMesh) return;
      child.frustumCulled = true;
      child.castShadow = false;
      child.receiveShadow = false;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material && "envMapIntensity" in material) material.envMapIntensity = 0.14;
      }
    });

    scene.add(modelRoot);
    modelBounds.setFromObject(modelRoot);
    modelBounds.getCenter(modelCenter);
    modelBounds.getSize(modelSize);
    prepareOverviewCamera();
    loadCollisionModel();
  },
  (event) => {
    if (!event.total) {
      setLoadingProgress(18, "正在载入建筑模型");
      return;
    }
    const percent = (event.loaded / event.total) * 76;
    setLoadingProgress(percent, "正在载入建筑模型");
  },
  showLoadError,
);

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    const targetMode = button.dataset.modeTarget;
    if (targetMode === "ar") {
      handleArRequest();
    } else {
      setMode(targetMode);
    }
  });
}

document.addEventListener("pointerlockchange", () => {
  if (activeMode !== "walk" || isCoarsePointer) {
    pointerLockPrompt.hidden = true;
    return;
  }
  pointerLockPrompt.hidden = document.pointerLockElement === canvas;
});

document.addEventListener("mousemove", (event) => {
  if (activeMode === "walk" && document.pointerLockElement === canvas) {
    updateLook(event.movementX, event.movementY);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLButtonElement) return;
  keyState[event.code] = true;
  if (
    activeMode === "walk" &&
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)
  ) {
    event.preventDefault();
  }
});

document.addEventListener("keyup", (event) => {
  keyState[event.code] = false;
});

canvas.addEventListener("click", () => {
  if (activeMode === "walk") requestWalkPointerLock();
});

canvas.addEventListener("pointerdown", (event) => {
  if (
    !isCoarsePointer ||
    activeMode !== "walk" ||
    event.clientX < window.innerWidth * 0.34
  ) {
    return;
  }
  touchLookPointer = event.pointerId;
  lastTouchLookX = event.clientX;
  lastTouchLookY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== touchLookPointer || activeMode !== "walk") return;
  const dx = event.clientX - lastTouchLookX;
  const dy = event.clientY - lastTouchLookY;
  lastTouchLookX = event.clientX;
  lastTouchLookY = event.clientY;
  updateLook(dx, dy, 0.004);
});

canvas.addEventListener("pointerup", (event) => {
  if (event.pointerId === touchLookPointer) touchLookPointer = null;
});

canvas.addEventListener("pointercancel", (event) => {
  if (event.pointerId === touchLookPointer) touchLookPointer = null;
});

joystick.addEventListener("pointerdown", (event) => {
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
});

joystick.addEventListener("pointermove", (event) => {
  if (event.pointerId === joystickPointer) updateJoystick(event);
});

joystick.addEventListener("pointerup", (event) => {
  if (event.pointerId === joystickPointer) resetJoystick();
});

joystick.addEventListener("pointercancel", resetJoystick);

infoButton.addEventListener("click", () => toggleInfoPanel());
closeInfoButton.addEventListener("click", () => toggleInfoPanel(false));
resetPositionButton.addEventListener("click", resetPlayerPosition);

fullscreenButton.addEventListener("click", async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await app.requestFullscreen();
  }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "退出全屏" : "全屏";
});

closeArHelp.addEventListener("click", () => arHelp.close());
arHelp.addEventListener("click", (event) => {
  if (event.target === arHelp) arHelp.close();
});

copyLinkButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(PAGE_URL);
    copyLinkButton.textContent = "链接已复制";
  } catch {
    window.prompt("复制页面链接", PAGE_URL);
  }
  window.setTimeout(() => {
    copyLinkButton.textContent = "复制页面链接";
  }, 1800);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isCoarsePointer ? 1.45 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(frameTime) {
  const delta = Math.min(0.05, Math.max(0, (frameTime - previousFrameTime) / 1000));
  previousFrameTime = frameTime;

  if (activeMode === "walk" && modelRoot) {
    updatePlayer(delta);
  } else {
    orbitControls.update();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
