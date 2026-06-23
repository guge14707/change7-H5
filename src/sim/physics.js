import { WORLD } from './constants.js';

export function vec(x = 0, y = 0) {
  return { x, y };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mul(a, k) {
  return { x: a.x * k, y: a.y * k };
}

export function len(a) {
  return Math.hypot(a.x, a.y);
}

export function norm(a) {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function moonState(t) {
  const omega = (Math.PI * 2) / WORLD.lunarPeriodGameSeconds;
  const angle = -0.72 + omega * t;
  const pos = {
    x: Math.cos(angle) * WORLD.moonOrbitR,
    y: Math.sin(angle) * WORLD.moonOrbitR
  };
  const vel = {
    x: -Math.sin(angle) * WORLD.moonOrbitR * omega,
    y: Math.cos(angle) * WORLD.moonOrbitR * omega
  };
  const forward = norm(vel);
  const radial = norm(pos);
  return { angle, pos, vel, forward, radial, omega };
}

function gravityAt(pos, bodyPos, mu, softening = 0.004) {
  const r = sub(bodyPos, pos);
  const d2 = r.x * r.x + r.y * r.y + softening * softening;
  const inv = 1 / Math.pow(d2, 1.5);
  return mul(r, mu * inv);
}

function limitVelocity(v) {
  const speed = len(v);
  if (speed > WORLD.maxSpeed) return mul(norm(v), WORLD.maxSpeed);
  if (speed < WORLD.minSpeed) return v;
  return v;
}

export function createInitialState() {
  const startAngle = -0.55;
  const startPos = {
    x: Math.cos(startAngle) * WORLD.earthParkingOrbitR,
    y: Math.sin(startAngle) * WORLD.earthParkingOrbitR
  };
  const tangent = { x: -Math.sin(startAngle), y: Math.cos(startAngle) };

  return {
    t: 0,
    status: 'running',
    phase: 'parking',
    probe: {
      pos: startPos,
      vel: mul(tangent, WORLD.earthParkingInitialSpeed),
      heading: Math.atan2(tangent.y, tangent.x),
      trail: [startPos],
      orbitalAngle: startAngle,
      orbitalSpeed: WORLD.earthParkingInitialSpeed,
      departedAt: null,
      lastBrakeAt: -999,
      nearMoonEntered: false,
      stableTicks: 0
    },
    telemetry: {
      speed: WORLD.earthParkingInitialSpeed,
      relMoonSpeed: 0,
      moonDistance: 0,
      solarDrift: 0,
      lunarForwardDrift: 0,
      escapeRatio: WORLD.earthParkingInitialSpeed / WORLD.earthParkingEscapeSpeed,
      hint: '近地停泊圆轨道巡航中：长按 W 提升轨道速度，超过逃逸阈值后自动进入地月转移。',
      bestDepartureAngle: 0, // ✅ 新增：最佳脱离点角度
      bestDeparturePos: { x: 0, y: 0 }, // ✅ 新增：最佳脱离点坐标
      timeToDeparture: Infinity, // ✅ 新增：到达脱离点剩余时间
      transferAction: null, // ✅ 新增：转移阶段操控动作
      lunarCaptureLocked: false, // ✅ 新增：月球捕获区操控锁定标记
      turnDirection: null, // ✅ 新增：当前转向方向（'left'/'right'/null）
      speedLimited: false, // ✅ 新增：速度是否达到上限（防止失控）
      nearMoonWarning: false // ✅ 新增：是否在月球入轨预警区内
    }
  };
}

export function stepSimulation(state, input, rawDt) {
  if (state.status !== 'running') return state;

  // 防止浏览器切后台后出现大步长积分。
  const dt = clamp(rawDt, 0.001, 0.033);
  const next = {
    ...state,
    probe: {
      ...state.probe,
      pos: { ...state.probe.pos },
      vel: { ...state.probe.vel },
      trail: state.probe.trail.map((point) => ({ ...point }))
    },
    telemetry: { ...state.telemetry }
  };
  next.t += dt;

  const probe = next.probe;
  const moon = moonState(next.t);
  const earthPos = vec(0, 0);

  // 阶段一：近地停泊圆轨道。
  // 这里先不让探测器自由积分，而是约束在近圆轨道上做稳定环绕；
  // 玩家长按 W 提高轨道速度，超过逃逸阈值后自动执行地月转移注入。
  if (next.phase === 'parking') {
    if (input.thrust) {
      probe.orbitalSpeed = clamp(
        probe.orbitalSpeed + WORLD.earthParkingThrottleRate * dt,
        WORLD.earthParkingInitialSpeed * 0.72,
        WORLD.earthParkingEscapeSpeed * 1.08
      );
    }
    if (input.brake) {
      probe.orbitalSpeed = clamp(
        probe.orbitalSpeed - WORLD.earthParkingBrakeRate * dt,
        WORLD.earthParkingInitialSpeed * 0.72,
        WORLD.earthParkingEscapeSpeed * 1.08
      );
      probe.lastBrakeAt = next.t;
    }

    // 停泊段严格禁用 A/D 航向修正：真实近地停泊轨道阶段先完成能量积累，
    // 未达到逃逸条件前不允许把航向硬拽向月球。

    const angularSpeed = probe.orbitalSpeed / WORLD.earthParkingOrbitR;
    probe.orbitalAngle += angularSpeed * dt;
    const tangent = { x: -Math.sin(probe.orbitalAngle), y: Math.cos(probe.orbitalAngle) };
    probe.pos = {
      x: Math.cos(probe.orbitalAngle) * WORLD.earthParkingOrbitR,
      y: Math.sin(probe.orbitalAngle) * WORLD.earthParkingOrbitR
    };
    probe.vel = mul(tangent, probe.orbitalSpeed);
    probe.heading = Math.atan2(tangent.y, tangent.x);

    probe.trail.push({ ...probe.pos });
    if (probe.trail.length > 240) probe.trail.shift();

    const moonDistance = len(sub(probe.pos, moon.pos));
    const relMoonSpeed = len(sub(probe.vel, moon.vel));
    next.telemetry.speed = probe.orbitalSpeed;
    next.telemetry.relMoonSpeed = relMoonSpeed;
    next.telemetry.moonDistance = moonDistance;
    next.telemetry.solarDrift = 0;
    next.telemetry.lunarForwardDrift = 0;
    next.telemetry.escapeRatio = probe.orbitalSpeed / WORLD.earthParkingEscapeSpeed;

    // ✅ 新增：计算最佳脱离点
    const leadMoon = add(moon.pos, mul(moon.forward, 0.28));
    const bestDepartureAngle = Math.atan2(leadMoon.y, leadMoon.x);
    next.telemetry.bestDepartureAngle = bestDepartureAngle;
    next.telemetry.bestDeparturePos = {
      x: Math.cos(bestDepartureAngle) * WORLD.earthParkingOrbitR,
      y: Math.sin(bestDepartureAngle) * WORLD.earthParkingOrbitR
    };
    let angDiff = bestDepartureAngle - probe.orbitalAngle;
    while (angDiff < 0) angDiff += Math.PI * 2;
    while (angDiff >= Math.PI * 2) angDiff -= Math.PI * 2;
    const angSpeed = probe.orbitalSpeed / WORLD.earthParkingOrbitR;
    next.telemetry.timeToDeparture = angSpeed > 0 ? angDiff / angSpeed : Infinity;
    next.telemetry.transferAction = null;
    next.telemetry.turnDirection = null; // ✅ 新增：停泊段无转向

    if (probe.orbitalSpeed >= WORLD.earthParkingEscapeSpeed) {
      const leadMoon = add(moon.pos, mul(moon.forward, 0.28));
      const toLeadMoon = norm(sub(leadMoon, probe.pos));
      const injectionDir = norm(add(
        mul(tangent, 0.30),
        mul(toLeadMoon, 1.00)
      ));
      const injectionVel = mul(
        injectionDir,
        Math.min(WORLD.maxSpeed, probe.orbitalSpeed + WORLD.transLunarInjectionBoost)
      );
      next.phase = 'transfer';
      probe.vel = limitVelocity(injectionVel);
      probe.heading = Math.atan2(probe.vel.y, probe.vel.x);
      probe.departedAt = next.t;
      probe.trail = [{ ...probe.pos }];
      next.telemetry.speed = len(probe.vel);
      next.telemetry.escapeRatio = 1;
      next.telemetry.hint = '速度已超过近地逃逸阈值：探测器脱离停泊轨道，进入地月转移段。现在可以用 A/D 小幅修正，近月前按 S 制动。';
      return next;
    }

    const ratioText = Math.round(next.telemetry.escapeRatio * 100);
    next.telemetry.hint = `近地停泊圆轨道巡航中：当前速度约为逃逸阈值 ${ratioText}%。长按 W 加速，超过阈值后自动转入地月转移。`;
    return next;
  }

  // ✅ 修改：地月转移阶段朝向控制——A/D 旋转改变飞船朝向，W/S 沿当前朝向加减速
  // ✅ 修改：A 键向右旋转（增大 heading 角度），D 键向左旋转（减小 heading 角度）
  if (input.left) probe.heading += WORLD.turnRate * dt; // ✅ 修改：A键向右旋转
  if (input.right) probe.heading -= WORLD.turnRate * dt; // ✅ 修改：D键向左旋转
  // ✅ 新增：方向键上下俯仰调整（较 A/D 更精细的航向微调）
  if (input.pitchUp) probe.heading -= WORLD.turnRate * 0.5 * dt;
  if (input.pitchDown) probe.heading += WORLD.turnRate * 0.5 * dt;

  // ✅ 修改：headingVec 必须在 A/D 旋转之后计算，确保新的朝向立即生效
  const headingVec = { x: Math.cos(probe.heading), y: Math.sin(probe.heading) };
  let acc = vec(0, 0);

  // 地球与月球引力。
  acc = add(acc, gravityAt(probe.pos, earthPos, WORLD.muEarth, 0.008));
  acc = add(acc, gravityAt(probe.pos, moon.pos, WORLD.muMoon, 0.006));

  // 向阳侧潮汐摄动：真实任务中太阳引力会参与地月转移动力学，这里用小量定向偏移表现。
  const sunDir = norm({ x: -1, y: -0.23 });
  const solarInfluence = 0.65 + 0.35 * Math.sin(next.t * 0.42);
  const solarAcc = mul(sunDir, WORLD.solarPerturbation * solarInfluence);
  acc = add(acc, solarAcc);

  // 月球不是静止目标：沿月球公转前进方向与横向摆动方向加入小摄动。
  const dMoon = len(sub(probe.pos, moon.pos));
  const lunarInfluence = clamp(1 / Math.max(0.38, dMoon), 0.55, 2.8);
  const forwardAcc = mul(moon.forward, WORLD.lunarForwardPerturbation * lunarInfluence);
  const cross = { x: -moon.forward.y, y: moon.forward.x };
  const crossAcc = mul(cross, WORLD.crossTrackPerturbation * Math.sin(next.t * 1.15) * lunarInfluence);
  acc = add(acc, forwardAcc);
  acc = add(acc, crossAcc);

  // ✅ 修改：W/S 均严格基于飞船当前实时朝向——旋转后新方向立即生效
  // W 键：沿飞船头部朝向向前加速
  if (input.thrust) acc = add(acc, mul(headingVec, WORLD.thrust));
  // S 键：沿飞船头部朝向反向减速/后退
  if (input.brake) {
    acc = add(acc, mul(headingVec, -WORLD.brake)); // ✅ 修改：沿朝向反向减速（非速度反向）
    probe.lastBrakeAt = next.t;
  }

  // ✅ 新增：W加速时将速度矢量朝飞船头部朝向逐渐旋转对齐
  // 解决问题：仅靠推力太弱无法改变运动方向，需要主动对齐速度方向
  if (input.thrust) {
    const speed = len(probe.vel);
    if (speed > WORLD.minSpeed) {
      const velAngle = Math.atan2(probe.vel.y, probe.vel.x);
      let angleDiff = probe.heading - velAngle;
      // 归一化到 [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      // 每帧最大对齐量不超过 headingAlignRate * dt
      const alignAmount = clamp(angleDiff, -WORLD.headingAlignRate * dt, WORLD.headingAlignRate * dt);
      const newAngle = velAngle + alignAmount;
      // ✅ 新增：保持速度大小不变，只旋转方向
      probe.vel = { x: Math.cos(newAngle) * speed, y: Math.sin(newAngle) * speed };
    }
  }

  // ✅ 新增：记录转移阶段操控状态
  if (input.thrust) {
    next.telemetry.transferAction = 'accelerating';
  } else if (input.brake) {
    next.telemetry.transferAction = 'decelerating';
  } else if (input.left || input.right || input.pitchUp || input.pitchDown) {
    next.telemetry.transferAction = 'turning';
  } else {
    next.telemetry.transferAction = null;
  }
  // ✅ 新增：记录转向方向（用于姿态喷流视觉反馈）
  next.telemetry.turnDirection = (input.left || input.pitchUp) ? 'left' : ((input.right || input.pitchDown) ? 'right' : null);
  next.telemetry.bestDepartureAngle = 0;
  next.telemetry.bestDeparturePos = { x: 0, y: 0 };
  next.telemetry.timeToDeparture = Infinity;

  probe.vel = limitVelocity(add(probe.vel, mul(acc, dt)));
  // ✅ 新增：最大速度限制检测——速度达到上限时标记 speedLimited 防止失控
  const currentSpeed = len(probe.vel);
  next.telemetry.speedLimited = currentSpeed >= WORLD.maxSpeed * 0.95; // ✅ 新增：接近或达到上限时标记
  probe.pos = add(probe.pos, mul(probe.vel, dt));

  // 轨迹尾迹控制长度，移动端也能保持流畅。
  probe.trail.push({ ...probe.pos });
  if (probe.trail.length > 520) probe.trail.shift();

  const earthDistance = len(probe.pos);
  const moonDistance = len(sub(probe.pos, moon.pos));
  const relMoonSpeed = len(sub(probe.vel, moon.vel));
  const speed = len(probe.vel);

  next.telemetry.speed = speed;
  next.telemetry.relMoonSpeed = relMoonSpeed;
  next.telemetry.moonDistance = moonDistance;
  next.telemetry.solarDrift = len(solarAcc);
  next.telemetry.lunarForwardDrift = len(forwardAcc) + len(crossAcc);
  // ✅ 新增：月球入轨预警——距月球小于阈值且未入轨成功时标记
  next.telemetry.nearMoonWarning = moonDistance < WORLD.moonApproachThreshold && next.status === 'running';

  if (earthDistance < WORLD.earth.r * 0.92) {
    next.status = 'earth-crash';
    return next;
  }
  if (moonDistance < WORLD.moon.r * 0.94) {
    next.status = 'moon-crash';
    return next;
  }
  // ✅ 修改：以地球为中心的圆形安全边界（半径 = 月球轨道半径 ×1.2）
  if (earthDistance > WORLD.safetyBoundary) {
    next.status = 'boundary-fail';
    return next;
  }
  if (Math.abs(probe.pos.x) > WORLD.boundary || Math.abs(probe.pos.y) > WORLD.boundary) {
    next.status = 'escape';
    return next;
  }

  // 进入近月捕获环。若相对月速高于按月球逃逸速度比例映射的阈值，
  // 则认为探测器无法被月球引力捕获，会从近月轨道区域飞离。
  const captureR = WORLD.moonCaptureOrbitR;
  const enteringCaptureBand = moonDistance < captureR + WORLD.captureTolerance;
  if (enteringCaptureBand && !probe.nearMoonEntered) {
    probe.nearMoonEntered = true;
  }

  if (enteringCaptureBand && relMoonSpeed > WORLD.lunarOrbitEscapeSpeed) {
    next.status = 'flyby-fail';
    return next;
  }

  const leavingCaptureZone = probe.nearMoonEntered && moonDistance > captureR + WORLD.captureTolerance * 6;
  if (leavingCaptureZone && relMoonSpeed > WORLD.stableOrbitMaxRelativeSpeed) {
    next.status = 'flyby-fail';
    return next;
  }

  if (enteringCaptureBand && relMoonSpeed <= WORLD.stableOrbitMaxRelativeSpeed) {
    probe.stableTicks += 1;
    next.telemetry.hint = '很好：近月段速度已经降低，月球引力有机会捕获探测器。';
    if (probe.stableTicks > 38) {
      next.status = 'success';
      return next;
    }
  } else {
    probe.stableTicks = Math.max(0, probe.stableTicks - 1);
    if (moonDistance < 0.22) {
      next.telemetry.hint = '进入近月影响区：请按 S 减速，否则会高速飞越月球。';
    } else if (earthDistance < 0.24) {
      next.telemetry.hint = '仍在近地停泊段：A/D 已锁定，请先长按 W 提升速度，超过逃逸阈值后再修正航向。';
    } else {
      next.telemetry.hint = '地月转移段：太阳摄动和月球前进方向会让轨迹持续漂移，需要小幅修正。';
    }
  }

  // ✅ 新增：月球捕获区操控锁定（进入稳定环月轨道后禁用所有手动控制）
  next.telemetry.lunarCaptureLocked = probe.stableTicks > 8;

  return next;
}
