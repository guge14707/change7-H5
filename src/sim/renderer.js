import { REAL, WORLD } from './constants.js';
import { len, moonState, sub, add, mul, norm } from './physics.js'; // ✅ 修改：新增 norm 导入

function setStrokeDash(ctx, dash) {
  ctx.setLineDash(dash);
  ctx.lineDashOffset = 0;
}

function drawText(ctx, text, x, y, options = {}) {
  const {
    size = 13,
    color = 'rgba(255,255,255,.86)',
    align = 'left',
    baseline = 'middle',
    weight = 500,
    shadow = true
  } = options;
  ctx.save();
  ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.65)';
    ctx.shadowBlur = 8;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function createProjector(canvas) {
  const { width, height } = canvas;
  const aspect = width / height;
  const halfX = WORLD.boundary + WORLD.viewPadding;
  const halfY = halfX / aspect;
  const finalHalfY = Math.max(0.72, halfY);
  const finalHalfX = Math.max(halfX, finalHalfY * aspect);
  const scale = Math.min(width / (finalHalfX * 2), height / (finalHalfY * 2)) * WORLD.sceneScale;
  return {
    width,
    height,
    scale,
    toScreen(p) {
      return {
        x: width / 2 + p.x * scale,
        y: height / 2 - p.y * scale
      };
    },
    worldRadius(r) {
      return r * scale;
    }
  };
}

function drawStars(ctx, p, t) {
  ctx.save();
  ctx.fillStyle = '#050814';
  ctx.fillRect(0, 0, p.width, p.height);

  // 固定伪随机星点，避免每帧闪烁。
  for (let i = 0; i < 120; i += 1) {
    const x = ((Math.sin(i * 91.7) * 0.5 + 0.5) * p.width) % p.width;
    const y = ((Math.sin(i * 47.3 + 2) * 0.5 + 0.5) * p.height) % p.height;
    const alpha = 0.22 + 0.55 * ((Math.sin(i * 13.1) + 1) / 2);
    const r = 0.6 + ((i % 7) / 10);
    ctx.globalAlpha = alpha * (0.85 + 0.15 * Math.sin(t * 1.2 + i));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();
}

function drawSunVector(ctx, p, state) { // ✅ 修改：增加 state 参数
  ctx.save();
  // ✅ 修改：移到右上偏中位置
  const cx = p.width - 50;
  const cy = p.height * 0.35;
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 160);
  grad.addColorStop(0, 'rgba(255,222,139,.55)');
  grad.addColorStop(0.45, 'rgba(255,190,80,.13)');
  grad.addColorStop(1, 'rgba(255,190,80,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(p.width - 240, cy - 120, 240, 240); // ✅ 修改：渐变区域移到右上偏中

  // ✅ 新增：根据偏转力度确定箭头颜色
  const drift = state.telemetry.solarDrift || 0;
  const maxDrift = WORLD.solarPerturbation;
  const driftRatio = maxDrift > 0 ? drift / maxDrift : 0;
  let arrowColor;
  if (driftRatio < 0.5) {
    arrowColor = 'rgba(100, 255, 150, .9)'; // 绿色：轻微偏转
  } else if (driftRatio < 0.8) {
    arrowColor = 'rgba(255, 225, 100, .9)'; // 黄色：中等偏转
  } else {
    arrowColor = 'rgba(255, 100, 100, .9)'; // 红色：显著偏转
  }

  // ✅ 修改：箭头显示实际偏转方向（太阳辐射压力推动方向）
  const sunDir = norm({ x: -1, y: 0.23 }); // 世界坐标偏转方向映射到屏幕坐标
  const arrowLen = 50;
  const endX = cx + sunDir.x * arrowLen;
  const endY = cy - sunDir.y * arrowLen; // 屏幕 y 轴翻转

  ctx.strokeStyle = arrowColor;
  ctx.fillStyle = arrowColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  // 箭头头部
  const a = Math.atan2(endY - cy, endX - cx);
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - 10 * Math.cos(a - 0.45), endY - 10 * Math.sin(a - 0.45));
  ctx.lineTo(endX - 10 * Math.cos(a + 0.45), endY - 10 * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
  drawText(ctx, '辐射偏转', cx + 55, cy, { size: 12, color: arrowColor, weight: 600 });
  ctx.restore();
}

function drawOrbit(ctx, p, center, radius, label, labelOffset, dash = [7, 8]) {
  const c = p.toScreen(center);
  ctx.save();
  setStrokeDash(ctx, dash);
  ctx.strokeStyle = 'rgba(255,255,255,.72)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(c.x, c.y, p.worldRadius(radius), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (label) {
    drawText(ctx, label, c.x + labelOffset.x, c.y + labelOffset.y, {
      size: 12,
      color: 'rgba(255,255,255,.9)',
      weight: 600
    });
  }
}

function drawMoonOrbit(ctx, p) {
  const c = p.toScreen({ x: 0, y: 0 });
  ctx.save();
  ctx.strokeStyle = 'rgba(120,170,255,.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c.x, c.y, p.worldRadius(WORLD.moonOrbitR), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  drawText(ctx, '月球自西向东公转轨迹', c.x + p.worldRadius(WORLD.moonOrbitR) - 170, c.y - 18, {
    size: 12,
    color: 'rgba(190,214,255,.76)'
  });
}

function drawEarth(ctx, p) {
  const c = p.toScreen(WORLD.earth);
  const r = p.worldRadius(WORLD.earth.r);
  ctx.save();
  const glow = ctx.createRadialGradient(c.x, c.y, r * 0.6, c.x, c.y, r * 2.6);
  glow.addColorStop(0, 'rgba(50,130,255,.35)');
  glow.addColorStop(1, 'rgba(50,130,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r * 2.55, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.35, r * 0.1, c.x, c.y, r);
  grad.addColorStop(0, '#a5efff');
  grad.addColorStop(0.45, '#2878e6');
  grad.addColorStop(1, '#0b2459');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(88,210,128,.65)';
  ctx.beginPath();
  ctx.ellipse(c.x - r * 0.18, c.y - r * 0.18, r * 0.22, r * 0.10, -0.6, 0, Math.PI * 2);
  ctx.ellipse(c.x + r * 0.18, c.y + r * 0.15, r * 0.28, r * 0.12, 0.5, 0, Math.PI * 2);
  ctx.fill();
  drawText(ctx, '地球', c.x, c.y + r + 17, { align: 'center', size: 13, color: 'rgba(180,218,255,.96)', weight: 700 });
  ctx.restore();
}

function drawMoon(ctx, p, moon) {
  const c = p.toScreen(moon.pos);
  const r = p.worldRadius(WORLD.moon.r);
  ctx.save();
  const glow = ctx.createRadialGradient(c.x, c.y, r * 0.4, c.x, c.y, r * 2.8);
  glow.addColorStop(0, 'rgba(230,230,230,.23)');
  glow.addColorStop(1, 'rgba(230,230,230,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r * 2.8, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(c.x - r * 0.4, c.y - r * 0.45, r * 0.1, c.x, c.y, r);
  grad.addColorStop(0, '#f2f2ee');
  grad.addColorStop(0.48, '#b5b5b0');
  grad.addColorStop(1, '#52545b');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(90,90,96,.38)';
  for (let i = 0; i < 5; i += 1) {
    const ox = Math.cos(i * 2.3) * r * 0.45;
    const oy = Math.sin(i * 1.7) * r * 0.35;
    ctx.beginPath();
    ctx.arc(c.x + ox, c.y + oy, r * (0.08 + (i % 3) * 0.025), 0, Math.PI * 2);
    ctx.fill();
  }

  // 南极标记：只做科普提示，不代表精确姿态。
  ctx.fillStyle = 'rgba(127,220,255,.96)';
  ctx.beginPath();
  ctx.arc(c.x, c.y + r * 0.62, Math.max(2, r * 0.12), 0, Math.PI * 2);
  ctx.fill();
  drawText(ctx, '月球南极', c.x + r + 8, c.y + r * 0.66, { size: 11, color: 'rgba(173,235,255,.95)' });
  drawText(ctx, '月球', c.x, c.y + r + 17, { align: 'center', size: 13, color: 'rgba(245,245,245,.92)', weight: 700 });
  ctx.restore();
}

function drawTrail(ctx, p, trail) {
  if (!trail || trail.length < 2) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  for (let i = 1; i < trail.length; i += 1) {
    const a = p.toScreen(trail[i - 1]);
    const b = p.toScreen(trail[i]);
    const alpha = (i / trail.length) * 0.72;
    ctx.strokeStyle = `rgba(112,226,255,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProbe(ctx, p, probe, state) { // ✅ 修改：增加 state 参数
  const c = p.toScreen(probe.pos);
  const angle = probe.heading;
  const size = Math.max(10, p.scale * 0.017);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(-angle);

  // ✅ 新增：飞船头部白色发光材质
  ctx.save();
  ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(size * 1.25, 0, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.shadowColor = 'rgba(104,231,255,.8)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#eafcff';
  ctx.strokeStyle = 'rgba(30,92,120,.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(size * 1.25, 0);
  ctx.lineTo(-size * 0.75, -size * 0.55);
  ctx.lineTo(-size * 0.42, 0);
  ctx.lineTo(-size * 0.75, size * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(95,210,255,.75)';
  ctx.fillRect(-size * 1.15, -size * 0.75, size * 0.42, size * 1.5);

  // ✅ 修改：根据操控状态调整引擎尾焰（W 加速放大2倍 / S 减速缩小反向）
  const action = state.telemetry.transferAction;
  const isAccel = action === 'accelerating';
  const isDecel = action === 'decelerating';
  const isSpeedLimited = state.telemetry.speedLimited; // ✅ 新增：速度上限检测
  const particleCount = isAccel ? 12 : 8; // ✅ 修改：加速时粒子数量增多
  const exhaustDir = isDecel ? 1 : -1; // ✅ 新增：减速时尾焰反向（前方喷射表示制动）
  const sizeMul = isAccel ? 2.0 : (isDecel ? 0.5 : 1); // ✅ 修改：加速放大2倍，减速缩小
  const baseX = isDecel ? size * 1.25 : -size * 1.15; // ✅ 新增：减速时粒子起始位置前移
  const t = state.t;
  for (let i = 0; i < particleCount; i++) {
    const phase = t * 6 + i * 0.85;
    const offset = phase % 1;
    const px = baseX + exhaustDir * size * 0.5 * offset * sizeMul;
    const spread = size * 0.25 * (1 - offset * 0.3) * sizeMul;
    const py = Math.sin(phase * 4.3 + i) * spread;
    const pr = size * (0.16 - offset * 0.1) * sizeMul;
    const alpha = 0.7 * (1 - offset);
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, pr), 0, Math.PI * 2);
    // ✅ 新增：速度达到上限时尾焰变为橙红色警告，否则保持蓝色
    const r = isSpeedLimited ? 255 : 0;
    const g = isSpeedLimited ? 120 : 150;
    const b = isSpeedLimited ? 30 : 255;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fill();
  }

  // ✅ 新增：转向时姿态控制喷口黄色短喷流
  const turnDir = state.telemetry.turnDirection;
  if (turnDir) {
    const jetSide = turnDir === 'left' ? 1 : -1; // ✅ 左转→右侧喷口(+y)，右转→左侧喷口(-y)
    const jetBaseX = size * 0.3;
    const jetBaseY = jetSide * size * 0.55;
    for (let i = 0; i < 4; i++) {
      const phase = t * 8 + i * 1.2;
      const offset = phase % 1;
      const jx = jetBaseX - size * 0.3 * offset;
      const jy = jetBaseY + jetSide * size * 0.2 * offset;
      const jr = size * (0.09 - offset * 0.06);
      const jalpha = 0.85 * (1 - offset);
      ctx.beginPath();
      ctx.arc(jx, jy, Math.max(0.5, jr), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 220, 50, ${jalpha})`;
      ctx.fill();
    }
  }

  ctx.restore();

  drawText(ctx, '嫦娥七号探测器', c.x + 14, c.y - 14, { size: 12, color: 'rgba(207,250,255,.94)' });
}

function drawTelemetry(ctx, p, state) {
  const moon = moonState(state.t);
  const distKm = len(sub(state.probe.pos, moon.pos)) * REAL.earthMoonDistanceKm;
  const kmSpeed = state.telemetry.speed * REAL.earthSpeedDisplayScaleKms; // 科普显示换算，不用于判据。
  const relMoonKms = state.telemetry.relMoonSpeed * REAL.lunarSpeedDisplayScaleKms;
  const phase = state.phase === 'parking' ? '近地停泊巡航' : '地月转移';
  const escapeLine = state.phase === 'parking'
    ? `逃逸阈值进度：${Math.round((state.telemetry.escapeRatio || 0) * 100)}%`
    : '逃逸阈值进度：已脱离近地停泊轨道';
  const lines = [
    `阶段：${phase}｜速度：${kmSpeed.toFixed(2)} km/s（缩放显示）`,
    escapeLine,
    `距月球：${Math.round(distKm).toLocaleString('zh-CN')} km｜相对月速：${relMoonKms.toFixed(2)} km/s`,
    state.telemetry.hint
  ];
  const x = 18;
  const y = p.height - 108;
  ctx.save();
  ctx.fillStyle = 'rgba(5,12,28,.48)';
  ctx.strokeStyle = 'rgba(160,220,255,.18)';
  ctx.lineWidth = 1;
  roundRect(ctx, x - 10, y - 16, Math.min(520, p.width - 36), 98, 14);
  ctx.fill();
  ctx.stroke();
  lines.forEach((line, i) => drawText(ctx, line, x, y + i * 22, {
    size: i === 3 ? 12 : 13,
    color: i === 3 ? 'rgba(255,232,166,.94)' : 'rgba(228,247,255,.94)',
    weight: i === 3 ? 600 : 500
  }));
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ✅ 新增：绘制最佳脱离点（黄色闪烁）
function drawDeparturePoint(ctx, p, state) {
  if (state.phase !== 'parking') return;
  const depPos = state.telemetry.bestDeparturePos;
  if (!depPos) return;
  const c = p.toScreen(depPos);
  const t = state.t;
  // 黄色闪烁效果
  const blink = 0.5 + 0.5 * Math.sin(t * 4);
  const radius = 4; // 直径 8px
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.shadowColor = 'rgba(255, 221, 0, 0.8)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffdd00';
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ✅ 新增：即将脱离提示（到达脱离点前 2 秒）
  if (state.telemetry.timeToDeparture < 2) {
    drawText(ctx, '即将加速脱离', c.x + 14, c.y - 14, {
      size: 13,
      color: 'rgba(255, 221, 0, 0.95)',
      weight: 700
    });
  }
}

// ✅ 新增：绘制安全边界圆
function drawSafetyBoundary(ctx, p) {
  const c = p.toScreen({ x: 0, y: 0 });
  const r = p.worldRadius(WORLD.safetyBoundary);
  ctx.save();
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = 0;
  ctx.strokeStyle = 'rgba(255, 80, 80, .22)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  drawText(ctx, '安全边界', c.x + r + 8, c.y - 8, {
    size: 11,
    color: 'rgba(255, 120, 120, .5)',
    weight: 500
  });
}

// ✅ 新增：绘制转移阶段状态标签
function drawTransferStatusLabel(ctx, p, state) {
  if (state.phase !== 'transfer') return;
  const action = state.telemetry.transferAction;
  if (!action) return;

  const c = p.toScreen(state.probe.pos);
  let label, color;
  switch (action) {
    case 'accelerating':
      label = '加速中';
      color = 'rgba(255, 100, 100, 0.95)';
      break;
    case 'decelerating':
      label = '减速中';
      color = 'rgba(100, 150, 255, 0.95)';
      break;
    case 'turning':
      label = '转向中';
      color = 'rgba(100, 255, 150, 0.95)';
      break;
    default:
      return;
  }
  drawText(ctx, label, c.x, c.y - 32, { size: 13, color, weight: 700, align: 'center' });
}

export function renderScene(canvas, state) {
  const ctx = canvas.getContext('2d');
  const p = createProjector(canvas);
  const moon = moonState(state.t);

  drawStars(ctx, p, state.t);
  drawSunVector(ctx, p, state); // ✅ 修改：传入 state
  drawMoonOrbit(ctx, p);
  drawSafetyBoundary(ctx, p); // ✅ 新增：绘制安全边界

  drawOrbit(ctx, p, WORLD.earth, WORLD.earthParkingOrbitR, '近地停泊圆轨道', { x: 18, y: -p.worldRadius(WORLD.earthParkingOrbitR) - 10 });
  drawOrbit(ctx, p, moon.pos, WORLD.moonCaptureOrbitR, '月球南极捕获环月轨道', { x: 18, y: -p.worldRadius(WORLD.moonCaptureOrbitR) - 10 }, [6, 7]);

  // 月球公转方向箭头。
  const arrowBase = p.toScreen({
    x: moon.pos.x - moon.forward.x * 0.055,
    y: moon.pos.y - moon.forward.y * 0.055
  });
  const arrowTip = p.toScreen({
    x: moon.pos.x + moon.forward.x * 0.055,
    y: moon.pos.y + moon.forward.y * 0.055
  });
  ctx.save();
  ctx.strokeStyle = 'rgba(180,214,255,.85)';
  ctx.fillStyle = 'rgba(180,214,255,.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(arrowBase.x, arrowBase.y);
  ctx.lineTo(arrowTip.x, arrowTip.y);
  ctx.stroke();
  const a = Math.atan2(arrowTip.y - arrowBase.y, arrowTip.x - arrowBase.x);
  ctx.beginPath();
  ctx.moveTo(arrowTip.x, arrowTip.y);
  ctx.lineTo(arrowTip.x - 8 * Math.cos(a - 0.45), arrowTip.y - 8 * Math.sin(a - 0.45));
  ctx.lineTo(arrowTip.x - 8 * Math.cos(a + 0.45), arrowTip.y - 8 * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawTrail(ctx, p, state.probe.trail);
  drawEarth(ctx, p);
  drawMoon(ctx, p, moon);
  drawDeparturePoint(ctx, p, state); // ✅ 新增：绘制最佳脱离点
  drawProbe(ctx, p, state.probe, state); // ✅ 修改：传入 state
  drawTransferStatusLabel(ctx, p, state); // ✅ 新增：绘制转移状态标签
  drawTelemetry(ctx, p, state);
}
