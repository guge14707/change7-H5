/**
 * 科普级地月系统常量与显示缩放。
 *
 * 注意：H5 互动模拟为了可玩性采用“缩放后的物理量”。UI 中保留真实量级，
 * 积分器使用无量纲世界坐标：1 个世界单位约等于真实地月平均距离 384,400 km。
 */
export const REAL = Object.freeze({
  earthMoonDistanceKm: 384400,
  earthRadiusKm: 6371,
  moonRadiusKm: 1737.4,
  lunarSiderealDays: 27.32166,
  earthMuKm3s2: 398600.4418,
  moonMuKm3s2: 4902.8001,
  lunarMeanSpeedKms: 1.022,
  lowEarthCircularSpeedKms: 7.8,
  earthEscapeSpeedKms: 10.13, // ✅ 修改：嫦娥七号真实地球逃逸速度阈值（11.2→10.13 km/s）
  lowLunarCircularSpeedKms: 1.77, // ✅ 修改：嫦娥七号真实月球入轨安全速度（1.63→1.77 km/s）
  lunarEscapeSpeedKms: 2.38,

  // 分段科普显示标尺：让停泊圆轨道速度显示为约 7.8 km/s，
  // 让稳定环月速度显示为约 1.77 km/s。它们只用于 UI，不参与积分。
  earthSpeedDisplayScaleKms: 106.85,
  lunarSpeedDisplayScaleKms: 52.58
});

export const WORLD = Object.freeze({
  earth: { x: 0, y: 0, r: 0.052, name: '地球' },
  earthParkingOrbitR: 0.13,
  moonOrbitR: 0.86,
  moon: { r: 0.022, name: '月球' },
  moonCaptureOrbitR: 0.085,
  viewPadding: 0.48,
  sceneScale: 0.78,

  // 为了在 H5 内可视化，把 27.3 天压缩成约 160 秒的公转周期。
  lunarPeriodGameSeconds: 160,

  // 缩放后的引力参数，月球/地球质量比仍按真实量级约 1/81 表示。
  muEarth: 0.00092,
  muMoon: 0.00092 * 0.0123,

  // 摄动量级：用于表现向阳侧引力潮汐和月球前进方向带来的轨迹偏移。
  solarPerturbation: 0.0000062,
  lunarForwardPerturbation: 0.0000048,
  crossTrackPerturbation: 0.0000022,

  // 玩家操控参数。
  thrust: 0.000088,
  brake: 0.005, // ✅ 修改：S键减速力度再增大10倍（0.0005→0.005），确保快速降至入轨安全速度
  turnRate: 1.9,
  headingAlignRate: 2.0, // ✅ 新增：W加速时速度矢量朝朝向对齐的角速度（弧度/秒）

  // 近地停泊段：先让探测器沿近圆轨道稳定环绕。
  // ✅ 修改：逃逸阈值按嫦娥七号真实速度比映射：10.13 km/s ÷ 7.8 km/s ≈ 1.30。
  earthParkingInitialSpeed: 0.073,
  earthParkingEscapeSpeed: 0.095, // ✅ 修改：对应 10.13 km/s 显示值（0.095 × 106.85 ≈ 10.15）
  earthParkingThrottleRate: 0.0078,
  earthParkingBrakeRate: 0.0105,
  transLunarInjectionBoost: 0.032,
  maxSpeed: 0.205,
  minSpeed: 0.002,

  // ✅ 修改：近月制动判据：嫦娥七号月球入轨安全速度 1.77 km/s，月球逃逸速度 2.38 km/s。
  // 入轨安全速度对应世界值：1.77 ÷ 52.58 ≈ 0.034。
  stableOrbitMaxRelativeSpeed: 0.034, // ✅ 修改：对应 ≤1.77 km/s 入轨安全阈值
  lunarOrbitEscapeSpeed: 0.045,
  captureMaxRelativeSpeed: 0.045,
  captureTolerance: 0.012,

  // 自动画面边界。
  boundary: 1.18,

  // ✅ 修改：安全边界半径（月球轨道半径 ×1.2）
  safetyBoundary: 0.86 * 1.2,

  // ✅ 修改：月球入轨速度预警触发距离（世界单位，0.66 ≈ 253,700 km，进一步提前触发减速提示）
  moonApproachThreshold: 0.66
});

export const UI_COPY = Object.freeze({
  title: '嫦娥七号 · 地月转移科普互动游戏',
  subtitle: '初始近地圆轨道巡航｜W 加速超过逃逸阈值后自动转入地月转移｜未脱离前禁用 A/D 航向修正',
  successTitle: '近月制动成功',
  successBody:
    '探测器已在月球南极捕获环月轨道附近完成减速，速度低到足以被月球引力捕获。真实任务中，这一步通常称为近月制动，是从地月转移轨道转入环月轨道的关键节点。',
  escapeTitle: '飞船逃逸失联',
  escapeBody:
    '探测器超出引力可控区域，脱离地月转移轨道，飞船逃逸失联！地月转移并不是直线飞行，轨道能量和方向必须持续受控。',
  earthCrashTitle: '撞击地球警示',
  earthCrashBody:
    '探测器返回近地点过低并撞击地球。真实航天任务中，近地停泊轨道需要保持安全高度，过低会进入稠密大气层，导致再入烧蚀或任务终止。',
  moonCrashTitle: '撞击月球警示',
  moonCrashBody:
    '探测器撞击月球表面。月球没有稠密大气层，无法像地球一样依靠大气减速；探月任务必须通过发动机制动和轨道控制避免硬撞击。',
  flybyTitle: '近月制动失败',
  flybyBody:
    '违背近月制动原理！月球引力不足以捕获高速探测器，未完成减速入轨，环月着陆任务失败！',
  // ✅ 新增：安全边界越界失败文案
  boundaryFailTitle: '任务失败',
  boundaryFailBody:
    '飞船已飞出安全区域，脱离可控地月转移轨道！',
  reset: '重新开始'
});
