<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { createInitialState, stepSimulation } from './sim/physics.js';
import { renderScene } from './sim/renderer.js';
import { REAL, UI_COPY, WORLD } from './sim/constants.js'; // ✅ 修改：新增 WORLD 导入

const canvasRef = ref(null);
const state = ref(createInitialState());
const input = reactive({ thrust: false, brake: false, left: false, right: false, pitchUp: false, pitchDown: false }); // ✅ 修改：新增 pitchUp/pitchDown
const isPaused = ref(false);
const showIntro = ref(true);
// ✅ 新增：视频弹窗状态
const videoModal = ref(null); // null 或 { title, src, desc }
const videoRef = ref(null);
const videoPlaying = ref(false);
// ✅ 新增：视频播放控制状态
const videoVolume = ref(1); // 音量 0-1
const videoMuted = ref(true); // 静音
const videoProgress = ref(0); // 当前进度 0-1
const videoDuration = ref(0); // 总时长（秒）
const videoCurrentTime = ref(0); // 当前时间（秒）
const videoPlaybackRate = ref(1); // 播放速率
let rafId = 0;
let lastTime = performance.now();
let resizeObserver;

const modal = computed(() => {
  const status = state.value.status;
  const map = {
    success: { title: UI_COPY.successTitle, body: UI_COPY.successBody, type: 'success' },
    'boundary-fail': { title: UI_COPY.boundaryFailTitle, body: UI_COPY.boundaryFailBody, type: 'danger' }, // ✅ 修改：超出安全边界统一弹窗
    escape: { title: UI_COPY.escapeTitle, body: UI_COPY.escapeBody, type: 'danger' }, // ✅ 修改：飞船逃逸统一弹窗
    'earth-crash': { title: UI_COPY.earthCrashTitle, body: UI_COPY.earthCrashBody, type: 'danger' }, // ✅ 修改：撞击地球统一弹窗
    'moon-crash': { title: UI_COPY.moonCrashTitle, body: UI_COPY.moonCrashBody, type: 'danger' }, // ✅ 修改：撞击月球统一弹窗
    'flyby-fail': { title: UI_COPY.flybyTitle, body: UI_COPY.flybyBody, type: 'danger' } // ✅ 修改：入轨未减速统一弹窗
  };
  return map[status] || null;
});

const speedText = computed(() => (state.value.telemetry.speed * REAL.earthSpeedDisplayScaleKms).toFixed(2));
const relMoonSpeedText = computed(() => (state.value.telemetry.relMoonSpeed * REAL.lunarSpeedDisplayScaleKms).toFixed(2));
const canSteer = computed(() => state.value.phase !== 'parking' && !state.value.telemetry.lunarCaptureLocked); // ✅ 修改：月球捕获区也禁用方向控制
const moonDistText = computed(() => Math.round(state.value.telemetry.moonDistance * REAL.earthMoonDistanceKm).toLocaleString('zh-CN'));
const phaseText = computed(() => (state.value.phase === 'parking' ? '近地停泊巡航' : '地月转移'));
const escapeRatioText = computed(() => `${Math.round((state.value.telemetry.escapeRatio || 0) * 100)}%`);

// ✅ 修改：移除 failOverlay（所有失败统一使用 modal 弹窗）

// ✅ 新增：月球入轨速度预警——接近月球时显示实时速度与警告
const moonSpeedWarning = computed(() => {
  if (!state.value.telemetry.nearMoonWarning) return null;
  const relSpeed = state.value.telemetry.relMoonSpeed;
  const isTooFast = relSpeed > WORLD.stableOrbitMaxRelativeSpeed;
  return {
    speed: (relSpeed * REAL.lunarSpeedDisplayScaleKms).toFixed(2),
    tooFast: isTooFast
  };
});

// ✅ 新增：月球入轨安全速度阈值（km/s，用于左下角遥测面板参考值）
const moonCaptureSpeedText = computed(() => (WORLD.stableOrbitMaxRelativeSpeed * REAL.lunarSpeedDisplayScaleKms).toFixed(2));

// ✅ 新增：太阳辐射偏转等级（用于指示器颜色）
const solarDriftClass = computed(() => {
  const drift = state.value.telemetry.solarDrift || 0;
  const maxDrift = WORLD.solarPerturbation;
  const ratio = maxDrift > 0 ? drift / maxDrift : 0;
  if (ratio < 0.5) return 'drift-low';
  if (ratio < 0.8) return 'drift-medium';
  return 'drift-high';
});

// ✅ 新增：科普知识点讲解视频数据
const knowledgeVideos = [
  {
    title: '脱离地球轨道',
    desc: '探测器先沿近地停泊轨道运行，随后通过地月转移注入点火获得足够能量，脱离近地轨道并进入奔月轨迹。',
    src: './videos/escape.mp4'
  },
  {
    title: '轨道偏离原因',
    desc: '地月转移过程中，探测器会持续受到太阳引力、月球公转前进方向和横向摄动影响，轨迹会被逐渐弯曲，因此实际飞行路径不是简单直线。',
    src: './videos/orbit-drift.mp4'
  },
  {
    title: '月球入轨',
    desc: '探测器接近月球后需要进行制动或轨道插入点火，降低相对速度，使其由飞越月球转变为被月球引力捕获并进入环月轨道。',
    src: './videos/lunar-capture.mp4'
  }
];

// ✅ 新增：打开科普视频弹窗
function openVideo(index) {
  videoModal.value = { ...knowledgeVideos[index] };
  videoPlaying.value = false;
}

// ✅ 新增：关闭科普视频弹窗（暂停视频）
function closeVideo() {
  if (videoRef.value) {
    videoRef.value.pause();
    videoPlaying.value = false;
  }
  videoModal.value = null;
}

// ✅ 新增：切换视频播放/暂停
function toggleVideo() {
  if (!videoRef.value) return;
  if (videoRef.value.paused) {
    videoRef.value.play();
    videoPlaying.value = true;
  } else {
    videoRef.value.pause();
    videoPlaying.value = false;
  }
}

// ✅ 新增：视频播放结束回调
function onVideoEnded() {
  videoPlaying.value = false;
}

// ✅ 新增：视频快进（+10秒）
function videoFastForward() {
  if (!videoRef.value) return;
  videoRef.value.currentTime = Math.min(videoRef.value.duration, videoRef.value.currentTime + 10);
}

// ✅ 新增：视频后退（-10秒）
function videoRewind() {
  if (!videoRef.value) return;
  videoRef.value.currentTime = Math.max(0, videoRef.value.currentTime - 10);
}

// ✅ 新增：设置音量
function setVolume(val) {
  if (!videoRef.value) return;
  videoVolume.value = val;
  videoRef.value.volume = val;
  if (val > 0) videoMuted.value = false;
  videoRef.value.muted = videoMuted.value;
}

// ✅ 新增：切换静音
function toggleMute() {
  if (!videoRef.value) return;
  videoMuted.value = !videoMuted.value;
  videoRef.value.muted = videoMuted.value;
}

// ✅ 新增：切换播放速率（0.5x, 1x, 1.5x, 2x 循环）
function togglePlaybackRate() {
  if (!videoRef.value) return;
  const rates = [0.5, 1, 1.5, 2];
  const currentIdx = rates.indexOf(videoRef.value.playbackRate);
  const nextIdx = (currentIdx + 1) % rates.length;
  videoPlaybackRate.value = rates[nextIdx];
  videoRef.value.playbackRate = rates[nextIdx];
}

// ✅ 新增：视频时间更新回调（更新进度条）
function onVideoTimeUpdate() {
  if (!videoRef.value || !videoRef.value.duration) return;
  videoCurrentTime.value = videoRef.value.currentTime;
  videoProgress.value = videoRef.value.currentTime / videoRef.value.duration;
}

// ✅ 新增：视频加载元数据回调
function onVideoLoaded() {
  if (!videoRef.value) return;
  videoDuration.value = videoRef.value.duration || 0;
}

// ✅ 新增：点击进度条跳转
function seekVideo(e) {
  if (!videoRef.value || !videoRef.value.duration) return;
  const rect = e.target.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = clickX / rect.width;
  videoRef.value.currentTime = ratio * videoRef.value.duration;
}

// ✅ 新增：格式化时间显示（秒 → mm:ss）
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function resizeCanvas() {
  const canvas = canvasRef.value;
  const parent = canvas?.parentElement;
  if (!canvas || !parent) return;
  // 为保证 Canvas 内文字、按钮与响应式布局比例稳定，这里按 CSS 像素绘制；
  // 赛事 H5 更关注跨端一致性，若追求极致清晰度，可再接入 DPR 缩放。
  const rect = parent.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width));
  canvas.height = Math.max(420, Math.floor(rect.height));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  renderScene(canvas, state.value);
}

function loop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if (!isPaused.value && !modal.value && !showIntro.value && !videoModal.value && state.value.status === 'running') { // ✅ 修改：视频弹窗打开时也暂停模拟
    state.value = stepSimulation(state.value, input, dt);
  }
  if (canvasRef.value) renderScene(canvasRef.value, state.value);
  rafId = requestAnimationFrame(loop);
}

const keyMap = {
  w: 'thrust',
  W: 'thrust',
  s: 'brake',
  S: 'brake',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
  ArrowUp: 'thrust', // ✅ 修改：方向键上改为与W同功能（加速）
  ArrowDown: 'brake', // ✅ 修改：方向键下改为与S同功能（减速）
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

function setKey(code, value) {
  const name = keyMap[code];
  if (!name) return;
  if ((name === 'left' || name === 'right' || name === 'pitchUp' || name === 'pitchDown') && state.value.phase === 'parking') { // ✅ 修改：俯仰在停泊段也锁定
    input[name] = false;
    return;
  }
  // ✅ 新增：月球捕获区锁定所有操控（进入稳定环月轨道后禁用手控）
  if (state.value.telemetry.lunarCaptureLocked) {
    input[name] = false;
    return;
  }
  input[name] = value;
}

function handleKeyDown(e) {
  if (keyMap[e.key]) {
    e.preventDefault();
    setKey(e.key, true);
  }
  if (e.key === ' ') {
    e.preventDefault();
    isPaused.value = !isPaused.value;
  }
  if (e.key === 'Enter' && (showIntro.value || modal.value)) {
    e.preventDefault();
    if (modal.value) reset();
    else start();
  }
  // ✅ 修改：R 键在危险类型弹窗（所有失败状态）时重新开始
  if ((e.key === 'r' || e.key === 'R') && modal.value?.type === 'danger') {
    e.preventDefault();
    reset();
  }
}

function handleKeyUp(e) {
  setKey(e.key, false);
}

function preventPageScroll(e) {
  if (e.cancelable) e.preventDefault();
}

function touchStart(name, event) {
  event.preventDefault();
  if ((name === 'left' || name === 'right') && state.value.phase === 'parking') {
    input[name] = false;
    return;
  }
  // ✅ 新增：月球捕获区锁定所有触控
  if (state.value.telemetry.lunarCaptureLocked) {
    input[name] = false;
    return;
  }
  input[name] = true;
}

function touchEnd(name, event) {
  event.preventDefault();
  input[name] = false;
}

function start() {
  showIntro.value = false;
  lastTime = performance.now();
}

function reset() {
  state.value = createInitialState();
  Object.keys(input).forEach((k) => { input[k] = false; });
  showIntro.value = false;
  isPaused.value = false;
  lastTime = performance.now();
}

onMounted(() => {
  resizeCanvas();
  resizeObserver = new ResizeObserver(resizeCanvas);
  if (canvasRef.value?.parentElement) resizeObserver.observe(canvasRef.value.parentElement);
  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  document.addEventListener('touchmove', preventPageScroll, { passive: false });
  window.scrollTo(0, 0);
  rafId = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  resizeObserver?.disconnect();
  window.removeEventListener('resize', resizeCanvas);
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  document.removeEventListener('touchmove', preventPageScroll);
});
</script>

<template>
  <main class="page-shell">
    <section class="hero-panel" aria-label="嫦娥七号地月转移模拟画面">
      <div class="canvas-frame" aria-label="地月转移轨道展示区域">
        <canvas ref="canvasRef" class="space-canvas" aria-label="地月转移轨道 Canvas"></canvas>
      </div>

      <header class="topbar">
        <div>
          <p class="eyebrow">青少年航天科普 H5</p>
          <h1>{{ UI_COPY.title }}</h1>
          <p class="subtitle">{{ UI_COPY.subtitle }}</p>
        </div>
        <button class="ghost-btn" type="button" @click="isPaused = !isPaused">
          {{ isPaused ? '继续' : '暂停' }}
        </button>
      </header>

      <!-- ✅ 修改：太阳辐射偏转指示器（右上偏中固定定位，动态颜色） -->
      <div class="sun-indicator" :class="solarDriftClass" aria-label="太阳辐射偏转提示">
        <span class="sun-deflection-arrow">↖</span>
        <span class="sun-label">辐射偏转</span>
      </div>

<!--      <aside class="science-card left-card">-->
<!--        <h2>轨道标注</h2>-->
<!--        <p><strong>近地停泊圆轨道：</strong>探测器先在地球附近建立安全轨道，等待合适窗口实施地月转移。</p>-->
<!--        <p><strong>月球南极捕获环月轨道：</strong>靠近月球后必须减速，让相对速度降到月球引力可捕获范围。</p>-->
<!--      </aside>-->

<!--      <aside class="science-card right-card">-->
<!--        <h2>为什么轨道会漂移？</h2>-->
<!--        <p>太阳引力会造成向阳侧微小偏移；月球一边公转一边吸引探测器，所以目标不是静止的圆点。</p>-->
<!--        <p>地月转移需要“提前量”和近月制动，直接瞄准月球或高速飞过都会失败。</p>-->
<!--      </aside>-->

      <section class="telemetry-panel" aria-label="实时状态">
        <span>阶段 {{ phaseText }}</span>
        <span>速度 {{ speedText }} km/s</span>
        <span v-if="state.phase === 'parking'">逃逸阈值 {{ escapeRatioText }}</span>
        <span>距月 {{ moonDistText }} km</span>
        <span>相对月速 {{ relMoonSpeedText }} km/s</span>
        <span v-if="!canSteer">{{ state.phase === 'parking' ? 'A/D 锁定' : '操控锁定' }}</span>
        <span v-if="state.telemetry.speedLimited" style="color: #ff7830; font-weight: 700;">⚠ 速度上限</span>
        <span v-if="state.phase !== 'parking'" style="color: #91ffd2;">入轨安全 ≤{{ moonCaptureSpeedText }} km/s</span>
      </section>

      <!-- ✅ 修改：月球入轨速度预警（中上方 fixed，接近月球时显示） -->
      <div v-if="moonSpeedWarning" class="moon-approach-warning" :class="{ 'speed-too-fast': moonSpeedWarning.tooFast }">
        <span class="moon-warning-speed">入轨速度 {{ moonSpeedWarning.speed }} km/s</span>
        <span v-if="moonSpeedWarning.tooFast" class="moon-warning-alert">速度过快，请减速</span>
      </div>

      <section class="mobile-controls" aria-label="触屏控制按钮">
        <button :disabled="!canSteer" @pointerdown="touchStart('left', $event)" @pointerup="touchEnd('left', $event)" @pointercancel="touchEnd('left', $event)" @pointerleave="touchEnd('left', $event)">A<br><small>右修正</small></button>
        <div class="vertical-controls">
          <button :disabled="state.telemetry.lunarCaptureLocked" @pointerdown="touchStart('thrust', $event)" @pointerup="touchEnd('thrust', $event)" @pointercancel="touchEnd('thrust', $event)" @pointerleave="touchEnd('thrust', $event)">W<br><small>加速</small></button>
          <button :disabled="state.telemetry.lunarCaptureLocked" @pointerdown="touchStart('brake', $event)" @pointerup="touchEnd('brake', $event)" @pointercancel="touchEnd('brake', $event)" @pointerleave="touchEnd('brake', $event)">S<br><small>减速</small></button>
        </div>
        <button :disabled="!canSteer" @pointerdown="touchStart('right', $event)" @pointerup="touchEnd('right', $event)" @pointercancel="touchEnd('right', $event)" @pointerleave="touchEnd('right', $event)">D<br><small>左修正</small></button>
      </section>
    </section>

    <!-- ✅ 修改：科普知识点卡片，点击打开讲解视频弹窗 -->
    <section class="knowledge-strip" aria-label="科普知识点">
      <article v-for="(item, index) in knowledgeVideos" :key="index" class="knowledge-card" @click="openVideo(index)">
        <h3>{{ item.title }}</h3>
        <p>{{ item.desc }}</p>
        <span class="video-hint">▶ 观看讲解视频</span>
      </article>
    </section>

    <div v-if="showIntro" class="modal-mask" role="dialog" aria-modal="true">
      <div class="modal intro-modal">
        <p class="eyebrow">任务简报</p>
        <h2>从近地停泊轨道出发，完成月球捕获</h2>
        <p>任务开始时，嫦娥七号会先沿白色虚线近地停泊圆轨道自动环绕。长按 <b>W</b> 提升轨道速度；当速度超过近地逃逸阈值后，探测器会自动脱离近地轨道并进入地月转移。脱离地球轨道前 <b>A/D</b> 会被锁定；进入转移段后再按 <b>A/D</b> 修正航向，靠近月球南极捕获环月轨道时必须按 <b>S</b> 减速，否则会高速飞越。</p>
        <ul>
          <li>不要飞出画面边界：那代表脱离可控地月转移区域。</li>
          <li>不要撞击地球或月球：真实航天器必须保持安全轨道高度。</li>
          <li>停泊段 A/D 方向修正被锁定，先用 W 积累速度；转移段再小幅修正航向。</li>
          <li>近月阶段速度过高会触发“近月制动失败”。</li>
        </ul>
        <button class="primary-btn" type="button" @click="start">开始任务</button>
      </div>
    </div>

    <div v-if="modal" class="modal-mask" role="dialog" aria-modal="true">
      <div class="modal" :class="modal.type">
        <p class="eyebrow">航天规则提示</p>
        <h2>{{ modal.title }}</h2>
        <p>{{ modal.body }}</p>
        <button class="primary-btn" type="button" @click="reset">{{ UI_COPY.reset }}</button>
      </div>
    </div>

    <!-- ✅ 新增：科普讲解视频弹窗（完整控制） -->
    <div v-if="videoModal" class="video-modal-mask" @click.self="closeVideo">
      <div class="video-modal">
        <div class="video-modal-header">
          <h2>{{ videoModal.title }}</h2>
          <button class="video-close-btn" @click="closeVideo" aria-label="关闭">✕</button>
        </div>
        <div class="video-player-wrapper">
          <video
            ref="videoRef"
            :src="videoModal.src"
            @ended="onVideoEnded"
            @timeupdate="onVideoTimeUpdate"
            @loadedmetadata="onVideoLoaded"
            @click="toggleVideo"
            playsinline
            preload="metadata"
          ></video>
          <button v-if="!videoPlaying" class="video-play-overlay" @click="toggleVideo" aria-label="播放">
            <span class="play-icon">▶</span>
          </button>
        </div>
        <!-- ✅ 新增：视频进度条 -->
        <div class="video-progress-bar" @click="seekVideo">
          <div class="video-progress-fill" :style="{ width: `${videoProgress * 100}%` }"></div>
        </div>
        <div class="video-controls">
          <div class="video-time-display">
            <span>{{ formatTime(videoCurrentTime) }}</span>
            <span>/</span>
            <span>{{ formatTime(videoDuration) }}</span>
          </div>
          <div class="video-main-controls">
            <button class="video-skip-btn" @click="videoRewind" aria-label="后退10秒">⏪ 10s</button>
            <button class="video-play-btn" @click="toggleVideo" aria-label="播放/暂停">
              {{ videoPlaying ? '⏸' : '▶' }}
            </button>
            <button class="video-skip-btn" @click="videoFastForward" aria-label="快进10秒">10s ⏩</button>
          </div>
          <div class="video-extra-controls">
            <button class="video-icon-btn" @click="toggleMute" aria-label="静音">
              {{ videoMuted || videoVolume === 0 ? '🔇' : '🔊' }}
            </button>
            <input type="range" class="video-volume-slider" min="0" max="1" step="0.05"
                   :value="videoVolume" @input="setVolume($event.target.value)" />
            <button class="video-speed-btn" @click="togglePlaybackRate">
              {{ videoPlaybackRate }}x
            </button>
          </div>
        </div>
        <div class="video-desc-wrapper">
          <span class="video-desc-text">{{ videoModal.desc }}</span>
        </div>
      </div>
    </div>
  </main>
</template>
