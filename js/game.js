/* 小蛋蛋闯关
   给小朋友的横版闯关。所有画面都是画出来的，没有图片和网络。
   手感故意放宽：土狼时间、提前按跳、落点有一点宽，掉下去就回到刚才的安全处。 */
(function () {
  "use strict";

  const PHYS = {
    gravity: 2100,
    maxFall: 1100,
    speed: 265,
    accel: 3400,
    decel: 4600,
    airAccel: 2600,
    airDecel: 700,
    jumpV: -770,
    bounceV: -1040,
    coyote: 0.14,
    buffer: 0.16,
    w: 40,
    h: 54,
  };

  const SAVE_KEY = "xiaodandan-v1";
  const MUTE_KEY = "xiaodandan-muted";

  const THEMES = [
    { sky: ["#ffd6ef", "#c9ecff", "#fff4c8"], hill: "#ffc4e0", hill2: "#b7f3c9", sea: "#ffb3d4" },
    { sky: ["#e4dcff", "#c6ecff", "#fff"], hill: "#d5f2ff", hill2: "#ffe0f4", sea: "#d9c8ff" },
    { sky: ["#ffe0f1", "#fff0c4", "#ffe6d4"], hill: "#ffd0ea", hill2: "#ffe7a4", sea: "#ffc4e0" },
  ];

  const FROST = [
    ["#ffd0e4", "#ff8fba", "#fff7fb"],
    ["#ffe7a8", "#ffc24d", "#fffdf4"],
    ["#c9f8e2", "#6ed9a4", "#f4fffb"],
    ["#e0d4ff", "#b79bff", "#fbf8ff"],
  ];

  const $= (id) => document.getElementById(id);
  const canvas = $("view");
  const ctx = canvas.getContext("2d");

  const ui = {
    levelName: $("level-name"),
    starNum: $("star-num"),
    starDen: $("star-den"),
    starPill: $("star-pill"),
    hint: $("hint"),
    toast: $("toast"),
    mute: $("mute"),
    title: $("screen-title"),
    clear: $("screen-clear"),
    finale: $("screen-finale"),
    clearDetail: $("clear-detail"),
    finaleStars: $("finale-stars"),
    levelSelect: $("level-select"),
    btnLeft: $("btn-left"),
    btnRight: $("btn-right"),
    btnJump: $("btn-jump"),
  };

  let cssW = 960;
  let cssH = 540;
  let dpr = 1;
  let mode = "title";
  let levelIndex = 0;
  let level = null;
  let animTime = 0;
  let levelTime = 0;
  let toastTimer = 0;
  let confetti = [];
  let particles = [];
  let cam = { x: 0, y: 0 };
  let cleared = [];
  let best = [0, 0, 0];
  let sessionStars = [0, 0, 0];
  const keys = new Set();
  const held = { left: false, right: false };

  const player = {
    x: 120,
    y: 520,
    vx: 0,
    vy: 0,
    onGround: true,
    wasGround: true,
    coyote: 0,
    jumpBuffer: 0,
    facing: 1,
    riding: null,
    checkpoint: { x: 120, y: 520 },
    safe: 0,
    land: 0,
    hitCd: 0,
    blinkT: 0,
    hop: 0,
  };

  let audioCtx = null;
  let master = null;
  let muted = false;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 隐私模式就算了 */ }
  }

  function loadSave() {
    muted = storageGet(MUTE_KEY) === "1";
    const raw = storageGet(SAVE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data.cleared)) cleared = data.cleared.filter((n) => n >= 0 && n <= 2);
      if (Array.isArray(data.best)) best = [0, 1, 2].map((i) => (data.best[i] | 0) || 0);
    } catch (e) { /* 坏掉的存档就当第一次玩 */ }
  }

  function saveProgress() {
    storageSet(SAVE_KEY, JSON.stringify({ cleared, best }));
  }

  function unlockAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) {
      audioCtx = new AC();
      master = audioCtx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!audioCtx || !master || muted) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function play(name) {
    if (name === "jump") tone(520, 0.12, "sine", 0.06, 0, 780);
    else if (name === "star") {
      tone(660, 0.09, "sine", 0.055);
      tone(880, 0.12, "sine", 0.05, 0.08);
    } else if (name === "win") {
      tone(523, 0.11, "sine", 0.06);
      tone(659, 0.11, "sine", 0.06, 0.1);
      tone(784, 0.11, "sine", 0.06, 0.2);
      tone(1046, 0.24, "sine", 0.06, 0.3);
    } else if (name === "bounce") {
      tone(240, 0.08, "triangle", 0.05);
      tone(480, 0.12, "sine", 0.05, 0.06);
    } else if (name === "cheer") {
      tone(587, 0.09, "sine", 0.045);
      tone(784, 0.16, "sine", 0.045, 0.08);
    } else if (name === "boop") tone(340, 0.09, "sine", 0.04);
  }

  function syncMute() {
    ui.mute.textContent = muted ? "声音 关" : "声音 开";
    ui.mute.setAttribute("aria-pressed", muted ? "true" : "false");
    if (master) master.gain.value = muted ? 0 : 0.9;
  }

  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add("show");
    ui.toast.classList.remove("pop");
    void ui.toast.offsetWidth;
    ui.toast.classList.add("pop");
    toastTimer = 2.15;
  }

  function cake(x, y, w) { return { x, y, w, h: 150, kind: "cake", mover: false }; }
  function cloud(x, y, w, extra) {
    return Object.assign({ x, y, w, h: 70, kind: "cloud", mover: false, baseX: x, baseY: y, ampX: 0, ampY: 0, period: 4, phase: 0 }, extra || {});
  }
  function step(x, y, w) { return { x, y, w, h: 36, kind: "step", mover: false }; }

  function makeLevel(index) {
    if (index === 0) {
      return {
        name: "星星小路",
        hint: "用 ← → 或下面的按钮移动，按「跳」跳过小沟沟",
        width: 2580,
        killY: 720,
        theme: 0,
        spawn: { x: 150, y: 520 },
        platforms: [
          cake(0, 520, 540),
          cake(640, 520, 400),
          cake(1160, 520, 600),
          cake(1880, 520, 660),
        ],
        pads: [{ x: 1380, y: 520, w: 130, squish: 0 }],
        stars: [
          { x: 260, y: 468, got: false },
          { x: 820, y: 400, got: false },
          { x: 1440, y: 400, got: false },
          { x: 2060, y: 420, got: false },
          { x: 2260, y: 468, got: false },
        ],
        flag: { x: 2360, y: 520 },
        spinners: [],
        hints: [],
      };
    }
    if (index === 1) {
      const bobber = cloud(1460, 520, 240, { mover: true, ampY: 36, period: 3.2, phase: 0.4 });
      const bridge = cloud(2280, 520, 260, { mover: true, ampX: 260, period: 12, phase: -Math.PI / 2 });
      // phase -π/2 让桥在开场时停在左边的云上，小朋友一走到就看得到。
      return {
        name: "软软云朵",
        hint: "",
        width: 3180,
        killY: 760,
        theme: 1,
        spawn: { x: 160, y: 520 },
        platforms: [
          cloud(0, 520, 460),
          cloud(580, 520, 340),
          cloud(1040, 520, 300),
          bobber,
          cloud(1820, 520, 380),
          bridge,
          cloud(2620, 520, 520),
        ],
        pads: [],
        stars: [
          { x: 240, y: 468, got: false },
          { x: 730, y: 400, got: false },
          { x: 1160, y: 468, got: false },
          { x: 1580, y: 450, got: false },
          { x: 2860, y: 468, got: false },
        ],
        flag: { x: 3000, y: 520 },
        spinners: [],
        hints: [{ x: 1980, text: "站上白云，它会轻轻带你过去", shown: false }],
      };
    }
    return {
      name: "旋转糖果",
      hint: "",
      width: 3120,
      killY: 760,
      theme: 2,
      spawn: { x: 150, y: 520 },
      platforms: [
        cake(0, 520, 460),
        cake(540, 520, 2500),
        step(1980, 450, 300),
        step(2200, 378, 300),
        step(2420, 306, 520),
      ],
      pads: [],
      stars: [
        { x: 230, y: 468, got: false },
        { x: 760, y: 410, got: false },
        { x: 1200, y: 468, got: false },
        { x: 2340, y: 330, got: false },
        { x: 2680, y: 252, got: false },
      ],
      flag: { x: 2780, y: 306 },
      spinners: [
        { x: 1020, y: 318, len: 196, thick: 26, period: 3.5, phase: 0.2 },
        { x: 1460, y: 318, len: 196, thick: 26, period: 3.5, phase: 2.4 },
      ],
      hints: [{ x: 820, text: "等糖果转开再过去，撞到也没关系", shown: false }],
    };
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = Math.max(320, window.innerWidth);
    cssH = Math.max(280, window.innerHeight);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  function viewScale() {
    const target = cssH < 430 ? 46 : cssW < 520 ? 52 : 70;
    return target / PHYS.h;
  }

  function syncHud() {
    document.body.dataset.mode = mode;
    document.body.dataset.level = String(levelIndex + 1);
    if (!level) return;
    ui.levelName.textContent = level.name;
    const got = level.stars.filter((s) => s.got).length;
    ui.starNum.textContent = String(got);
    ui.starDen.textContent = String(level.stars.length);
    document.body.dataset.stars = got + "/" + level.stars.length;
    if (mode === "play" && level.hint) {
      ui.hint.textContent = level.hint;
      ui.hint.hidden = false;
    } else {
      ui.hint.hidden = true;
    }
  }

  function bumpStars() {
    ui.starPill.classList.remove("bump");
    void ui.starPill.offsetWidth;
    ui.starPill.classList.add("bump");
  }

  function renderLevelSelect() {
    const box = ui.levelSelect;
    if (!cleared.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const unlocked = i === 0 || cleared.indexOf(i - 1) !== -1;
      const btn = document.createElement("button");
      btn.type = "button";
      const name = document.createElement("span");
      name.textContent = makeLevel(i).name;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = unlocked ? "星星 " + (best[i] || 0) + "/5" : "先完成上一关";
      btn.appendChild(name);
      btn.appendChild(meta);
      if (!unlocked) btn.classList.add("locked");
      btn.addEventListener("click", () => {
        unlockAudio();
        if (!unlocked) {
          btn.classList.remove("wiggle");
          void btn.offsetWidth;
          btn.classList.add("wiggle");
          showToast("先玩前面的关卡呀");
          return;
        }
        startLevel(i);
      });
      box.appendChild(btn);
    }
  }

  function showScreen() {
    ui.title.hidden = mode !== "title";
    ui.clear.hidden = mode !== "clear";
    ui.finale.hidden = mode !== "finale";
    if (mode === "title") renderLevelSelect();
    syncHud();
  }

  function firstUncleared() {
    for (let i = 0; i < 3; i++) if (cleared.indexOf(i) === -1) return i;
    return 0;
  }

  function placePlayer(x, y) {
    player.x = x;
    player.y = y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.wasGround = true;
    player.coyote = PHYS.coyote;
    player.jumpBuffer = 0;
    player.riding = null;
    player.safe = 0.35;
  }

  function snapCamera() {
    const scale = viewScale();
    const viewH = cssH / scale;
    const viewW = cssW / scale;
    const footRatio = cssH < 420 ? 0.48 : cssH < 520 ? 0.55 : 0.62;
    cam.x = clamp(player.x + 70 - viewW * 0.42, 0, Math.max(0, level.width - viewW));
    cam.y = player.y - viewH * footRatio;
  }

  function placeMovers() {
    for (let i = 0; i < level.platforms.length; i++) {
      const plat = level.platforms[i];
      if (!plat.mover) continue;
      const s = Math.sin((levelTime / plat.period) * Math.PI * 2 + plat.phase);
      plat.x = plat.baseX + s * (plat.ampX || 0);
      plat.y = plat.baseY + s * (plat.ampY || 0);
      plat.dx = 0;
      plat.dy = 0;
    }
  }

  function startLevel(index) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    levelIndex = clamp(index, 0, 2);
    level = makeLevel(levelIndex);
    levelTime = 0;
    placeMovers();
    particles = [];
    placePlayer(level.spawn.x, level.spawn.y);
    player.checkpoint = { x: level.spawn.x, y: level.spawn.y };
    player.facing = 1;
    player.hitCd = 0;
    player.land = 0;
    snapCamera();
    mode = "play";
    showScreen();
    showToast("出发啦！");
  }

  function starsGot() {
    return level.stars.filter((s) => s.got).length;
  }

  function finishLevel() {
    const got = starsGot();
    sessionStars[levelIndex] = got;
    if (got > (best[levelIndex] || 0)) best[levelIndex] = got;
    if (cleared.indexOf(levelIndex) === -1) cleared.push(levelIndex);
    saveProgress();
    play("win");
    burstHearts(player.x, player.y - 70, 10);
    if (levelIndex === 2) {
      mode = "finale";
      const total = sessionStars.reduce((a, b) => a + b, 0);
      ui.finaleStars.textContent = total >= 15
        ? "一共收集了 " + total + " 颗星星，全都找到啦！"
        : "一共收集了 " + total + " 颗星星";
      spawnConfetti();
    } else {
      mode = "clear";
      const name = level.name;
      ui.clearDetail.textContent = got >= level.stars.length
        ? "「" + name + "」完成啦！星星全部捡到，你太仔细啦！"
        : got <= 0
          ? "「" + name + "」完成啦！下次星星也会等你。"
          : "「" + name + "」完成啦！你捡到了 " + got + " 颗星星！";
    }
    showScreen();
  }

  function goTitle() {
    mode = "title";
    showScreen();
  }

  function replayAll() {
    sessionStars = [0, 0, 0];
    startLevel(0);
  }

  function inputAxis() {
    let axis = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA") || held.left) axis -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD") || held.right) axis += 1;
    return axis;
  }

  function bufferJump() {
    player.jumpBuffer = PHYS.buffer;
  }

  function isJumpCode(code) {
    return code === "Space" || code === "ArrowUp" || code === "KeyW";
  }

  function tryJump() {
    if (player.jumpBuffer <= 0) return false;
    if (!(player.onGround || player.coyote > 0)) return false;
    player.vy = PHYS.jumpV;
    player.onGround = false;
    player.wasGround = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.riding = null;
    player.hop = 0.18;
    play("jump");
    return true;
  }

  function overlapX(px, plat, pad) {
    const extra = pad == null ? 8 : pad;
    const left = px - PHYS.w / 2;
    const right = px + PHYS.w / 2;
    return right > plat.x - extra && left < plat.x + plat.w + extra;
  }

  function centerOn(px, plat) {
    return px >= plat.x && px <= plat.x + plat.w;
  }

  function nearPad(x) {
    return level.pads.some((pad) => x >= pad.x - 16 && x <= pad.x + pad.w + 16);
  }

  function updateMovers(dt) {
    for (let i = 0; i < level.platforms.length; i++) {
      const plat = level.platforms[i];
      if (!plat.mover) continue;
      const prevX = plat.x;
      const prevY = plat.y;
      const s = Math.sin((levelTime / plat.period) * Math.PI * 2 + plat.phase);
      plat.x = plat.baseX + s * (plat.ampX || 0);
      plat.y = plat.baseY + s * (plat.ampY || 0);
      plat.dx = plat.x - prevX;
      plat.dy = plat.y - prevY;
    }
  }

  function maybeCheckpoint(plat) {
    if (!plat || plat.mover || plat.w < 100) return;
    // 记在平台靠里面的位置，不要记在沟边，免得按住右键又马上掉下去。
    const x = plat.x + Math.min(110, Math.max(48, plat.w * 0.28));
    if (nearPad(x)) return;
    if (x <= player.checkpoint.x + 24) return;
    if (plat.y > player.checkpoint.y + 70) return;
    player.checkpoint = { x, y: plat.y };
  }

  function pickSupport(candidates) {
    let staticPlat = null;
    let mover = null;
    for (let i = 0; i < candidates.length; i++) {
      const plat = candidates[i];
      if (!centerOn(player.x, plat) && !overlapX(player.x, plat, 0)) continue;
    if (plat.mover) {
      if (centerOn(player.x, plat) || overlapX(player.x, plat, 0)) mover = plat;
    } else if (centerOn(player.x, plat) || overlapX(player.x, plat, 4)) {
        if (!staticPlat || plat.y < staticPlat.y) staticPlat = plat;
      }
    }
    if (staticPlat && centerOn(player.x, staticPlat)) return staticPlat;
    if (mover) return mover;
    return staticPlat;
  }

  function landOn(list, oldBottom) {
    const hit = [];
    for (let i = 0; i < list.length; i++) {
      const plat = list[i];
      if (player.vy < 0) continue;
      if (!overlapX(player.x, plat, 8)) continue;
      if (oldBottom <= plat.y + 2 && player.y >= plat.y - 1) hit.push(plat);
    }
    return pickSupport(hit);
  }

  function respawn() {
    placePlayer(player.checkpoint.x, player.checkpoint.y);
    player.safe = 0.45;
    showToast("再试一次，你超棒！");
    burstHearts(player.x, player.y - 60, 6);
    play("cheer");
  }

  function spinnerPose(sp) {
    const ang = sp.phase + (levelTime / sp.period) * Math.PI * 2;
    return {
      x1: sp.x,
      y1: sp.y,
      x2: sp.x + Math.sin(ang) * sp.len,
      y2: sp.y + Math.cos(ang) * sp.len,
      ang,
    };
  }

  function distToSeg(px, py, seg) {
    const abx = seg.x2 - seg.x1;
    const aby = seg.y2 - seg.y1;
    const apx = px - seg.x1;
    const apy = py - seg.y1;
    const ab2 = abx * abx + aby * aby || 1;
    let t = (apx * abx + apy * aby) / ab2;
    t = clamp(t, 0, 1);
    const qx = seg.x1 + abx * t;
    const qy = seg.y1 + aby * t;
    return { d: Math.hypot(px - qx, py - qy), qx, qy };
  }

  function hitSpinners(startX) {
    if (player.hitCd > 0) return;
    const cx = player.x;
    const cy = player.y - PHYS.h * 0.48;
    const reach = PHYS.w * 0.48;
    for (let i = 0; i < level.spinners.length; i++) {
      const sp = level.spinners[i];
      const seg = spinnerPose(sp);
      const hit = distToSeg(cx, cy, seg);
      if (hit.d > reach + sp.thick * 0.5) continue;
      const dir = player.x < sp.x ? -1 : 1;
      player.x = clamp(startX + dir * 36, 28, level.width - 28);
      player.vx = dir * 40;
      player.vy = Math.min(player.vy, -280);
      player.onGround = false;
      player.riding = null;
      player.hitCd = 0.55;
      player.hop = 0.16;
      play("boop");
      burstHearts(player.x, player.y - 50, 3);
      if (!sp.noted) {
        sp.noted = true;
        showToast("轻轻挡住啦，等一等再过去");
      }
      return;
    }
  }

  function collectStars() {
    const cy = player.y - PHYS.h * 0.45;
    for (let i = 0; i < level.stars.length; i++) {
      const star = level.stars[i];
      if (star.got) continue;
      const dx = star.x - player.x;
      const dy = star.y - cy;
      if (dx * dx + dy * dy > 44 * 44) continue;
      star.got = true;
      play("star");
      bumpStars();
      syncHud();
      burstSparkles(star.x, star.y);
      floatText(star.x, star.y, "+1");
    }
  }

  function flagHit() {
    const flag = level.flag;
    const left = player.x - PHYS.w / 2;
    const right = player.x + PHYS.w / 2;
    const top = player.y - PHYS.h;
    const bottom = player.y;
    const fl = flag.x - 24;
    const fr = flag.x + 54;
    const ft = flag.y - 130;
    const fb = flag.y + 8;
    return right > fl && left < fr && bottom > ft && top < fb;
  }

  function updatePlay(dt) {
    levelTime += dt;
    if (player.safe > 0) player.safe -= dt;
    if (player.hitCd > 0) player.hitCd -= dt;
    if (player.land > 0) player.land -= dt;
    if (player.hop > 0) player.hop -= dt;
    if (player.jumpBuffer > 0) player.jumpBuffer -= dt;

    updateMovers(dt);
    if (player.riding && player.riding.mover) {
      player.x += player.riding.dx || 0;
      player.y += player.riding.dy || 0;
    }

    const axis = inputAxis();
    const accel = player.onGround ? PHYS.accel : PHYS.airAccel;
    const decel = player.onGround ? PHYS.decel : PHYS.airDecel;
    if (axis !== 0) {
      player.vx += axis * accel * dt;
      player.facing = axis > 0 ? 1 : -1;
      player.vx = clamp(player.vx, -PHYS.speed, PHYS.speed);
    } else if (player.vx !== 0) {
      const stepV = decel * dt;
      if (Math.abs(player.vx) <= stepV) player.vx = 0;
      else player.vx -= Math.sign(player.vx) * stepV;
    }

    tryJump();

    const startX = player.x;
    player.x += player.vx * dt;
    player.x = clamp(player.x, 28, level.width - 28);

    player.vy += PHYS.gravity * dt;
    if (player.vy > PHYS.maxFall) player.vy = PHYS.maxFall;
    const oldBottom = player.y;
    player.y += player.vy * dt;

    const support = player.vy >= 0 ? landOn(level.platforms, oldBottom) : null;
    if (support) {
      const fell = !player.wasGround;
      player.y = support.y;
      player.vy = 0;
      player.onGround = true;
      player.riding = support.mover ? support : null;
      if (fell) player.land = 0.14;
      maybeCheckpoint(support);
      const pad = level.pads.find((item) => player.x >= item.x - 6 && player.x <= item.x + item.w + 6);
      if (pad) {
        player.vy = PHYS.bounceV;
        player.onGround = false;
        player.riding = null;
        player.coyote = 0;
        player.jumpBuffer = 0;
        player.hop = 0.2;
        pad.squish = 0.22;
        play("bounce");
      }
    } else {
      player.onGround = false;
      player.riding = null;
    }

    if (player.onGround) player.coyote = PHYS.coyote;
    else player.coyote -= dt;

    tryJump();

    for (let i = 0; i < level.pads.length; i++) {
      if (level.pads[i].squish > 0) level.pads[i].squish = Math.max(0, level.pads[i].squish - dt);
    }

    hitSpinners(startX);
    collectStars();

    for (let i = 0; i < level.hints.length; i++) {
      const hint = level.hints[i];
      if (!hint.shown && player.x > hint.x && toastTimer < 0.4) {
        hint.shown = true;
        showToast(hint.text);
      }
    }

    if (flagHit()) {
      finishLevel();
      return;
    }

    if (player.safe <= 0 && player.y > level.killY) respawn();
    player.wasGround = player.onGround;

    if (player.onGround && Math.abs(player.vx) > 40 && Math.random() < dt * 8) {
      puff(player.x, player.y, "#fff");
    }
  }

  function updateCamera(dt) {
    const scale = viewScale();
    const viewW = cssW / scale;
    const viewH = cssH / scale;
    const footRatio = cssH < 420 ? 0.48 : cssH < 520 ? 0.55 : 0.62;
    const lead = player.facing * 80;
    let targetX = player.x + lead - viewW * 0.42;
    let targetY = player.y - viewH * footRatio;
    targetX = clamp(targetX, 0, Math.max(0, level.width - viewW));
    const k = 1 - Math.exp(-dt * 5);
    cam.x += (targetX - cam.x) * k;
    cam.y += (targetY - cam.y) * k;
  }

  function burstHearts(x, y, n) {
    for (let i = 0; i < n; i++) {
      particles.push({
        kind: "heart",
        x, y,
        vx: -30 + Math.random() * 60,
        vy: -80 - Math.random() * 80,
        life: 0.9 + Math.random() * 0.4,
        age: 0,
        s: 7 + Math.random() * 6,
        color: i % 2 ? "#ff8fba" : "#ffd36a",
      });
    }
  }

  function burstSparkles(x, y) {
    for (let i = 0; i < 8; i++) {
      particles.push({
        kind: "spark",
        x, y,
        vx: -70 + Math.random() * 140,
        vy: -90 + Math.random() * 50,
        life: 0.45,
        age: 0,
        s: 3 + Math.random() * 3,
        color: "#ffe56a",
      });
    }
  }

  function puff(x, y, color) {
    particles.push({
      kind: "puff",
      x, y,
      vx: -10 + Math.random() * 20,
      vy: -8,
      life: 0.35,
      age: 0,
      s: 5,
      color,
    });
  }

  function floatText(x, y, text) {
    particles.push({ kind: "text", x, y, vx: 0, vy: -36, life: 0.7, age: 0, text, s: 18, color: "#e07a00" });
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "heart") p.vy += 40 * dt;
      if (p.age >= p.life) particles.splice(i, 1);
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.y += c.vy * dt;
      c.x += c.vx * dt;
      c.rot += c.vr * dt;
      c.vy += 20 * dt;
      if (c.y > cssH + 30) {
        c.y = -20;
        c.x = Math.random() * cssW;
      }
    }
  }

  function spawnConfetti() {
    confetti = [];
    const colors = ["#ff8fb8", "#ffe27a", "#9ad7ff", "#c9b6ff", "#b8f5c8", "#ffd0a8"];
    for (let i = 0; i < 70; i++) {
      confetti.push({
        x: Math.random() * cssW,
        y: Math.random() * cssH,
        vx: -30 + Math.random() * 60,
        vy: 50 + Math.random() * 110,
        w: 7 + Math.random() * 7,
        h: 9 + Math.random() * 8,
        rot: Math.random() * 6,
        vr: -2 + Math.random() * 4,
        color: colors[i % colors.length],
        heart: i % 4 === 0,
      });
    }
  }

  function roundRect(ctx2, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx2.beginPath();
    ctx2.moveTo(x + rad, y);
    ctx2.arcTo(x + w, y, x + w, y + h, rad);
    ctx2.arcTo(x + w, y + h, x, y + h, rad);
    ctx2.arcTo(x, y + h, x, y, rad);
    ctx2.arcTo(x, y, x + w, y, rad);
    ctx2.closePath();
  }

  function heartPath(ctx2, s) {
    ctx2.beginPath();
    ctx2.moveTo(0, s * 0.35);
    ctx2.bezierCurveTo(-s * 1.05, -s * 0.35, -s * 0.55, -s * 1.05, 0, -s * 0.4);
    ctx2.bezierCurveTo(s * 0.55, -s * 1.05, s * 1.05, -s * 0.35, 0, s * 0.35);
    ctx2.closePath();
  }

  function drawHeart(ctx2, x, y, s, color) {
    ctx2.save();
    ctx2.translate(x, y);
    ctx2.fillStyle = color;
    heartPath(ctx2, s);
    ctx2.fill();
    ctx2.restore();
  }

  function drawStarShape(ctx2, x, y, r, rot) {
    ctx2.save();
    ctx2.translate(x, y);
    ctx2.rotate(rot);
    ctx2.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const b = a + Math.PI / 5;
      ctx2.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx2.lineTo(Math.cos(b) * r * 0.42, Math.sin(b) * r * 0.42);
    }
    ctx2.closePath();
    ctx2.fill();
    ctx2.restore();
  }

  function drawSky(theme) {
    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(0.45, theme.sky[1]);
    g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);

    const sunX = cssW * 0.82;
    const sunY = cssH * 0.16;
    const sun = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 70);
    sun.addColorStop(0, "#fff7cf");
    sun.addColorStop(1, "rgba(255, 214, 120, 0)");
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe56a";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c47b2a";
    ctx.beginPath();
    ctx.arc(sunX - 10, sunY - 4, 3.2, 0, Math.PI * 2);
    ctx.arc(sunX + 10, sunY - 4, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c47b2a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sunX, sunY + 4, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();

    drawHill(theme.hill, 0.18, cssH * 0.72, 36);
    drawHill(theme.hill2, 0.38, cssH * 0.8, 26);

    ctx.save();
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 5; i++) {
      const bx = ((i * 220 - cam.x * 0.15) % (cssW + 180) + cssW + 180) % (cssW + 180) - 40;
      const by = 70 + (i % 3) * 36 + Math.sin(animTime * 0.7 + i) * 8;
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.7)" : "rgba(255, 190, 220, 0.45)";
      ctx.beginPath();
      ctx.ellipse(bx, by, 36, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(bx + 22, by + 4, 24, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(bx - 20, by + 6, 22, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHill(color, parallax, baseY, amp) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, cssH);
    for (let x = 0; x <= cssW; x += 24) {
      const y = baseY + Math.sin((x + cam.x * parallax) * 0.012) * amp + Math.sin((x + cam.x * parallax) * 0.004) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cssW, cssH);
    ctx.closePath();
    ctx.fill();
  }

  function drawCake(plat, tint) {
    const colors = FROST[tint % FROST.length];
    const h = 130;
    ctx.save();
    roundRect(ctx, plat.x, plat.y, plat.w, h, 22);
    const g = ctx.createLinearGradient(plat.x, plat.y, plat.x, plat.y + h);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let x = plat.x + 16; x < plat.x + plat.w - 8; x += 22) {
      ctx.fillRect(x, plat.y + 28, 8, h - 40);
    }
    ctx.fillStyle = colors[2];
    ctx.beginPath();
    ctx.ellipse(plat.x + plat.w / 2, plat.y + 6, plat.w * 0.48, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    const sprinkle = ["#ff7eb6", "#ffe56a", "#8fd4ff", "#b7f3c9"];
    const seed = (plat.x * 13 + plat.y) | 0;
    for (let i = 0; i < Math.floor(plat.w / 36); i++) {
      const sx = plat.x + 18 + ((seed + i * 47) % Math.max(20, plat.w - 36));
      ctx.fillStyle = sprinkle[(seed + i) % sprinkle.length];
      ctx.save();
      ctx.translate(sx, plat.y + 4);
      ctx.rotate(((seed + i) % 7) * 0.2);
      ctx.fillRect(-4, -2, 8, 3.5);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawCloudPlat(plat) {
    ctx.save();
    const bob = Math.sin(animTime * 2 + plat.x * 0.01) * 2;
    const puffs = Math.max(3, Math.round(plat.w / 70));
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    for (let i = 0; i < puffs; i++) {
      const cx = plat.x + ((i + 0.5) * plat.w) / puffs;
      const cy = plat.y + 18 + bob;
      const rw = plat.w / puffs * 0.78;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 10, rw, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(cx, cy - 6, rw * 0.72, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 182, 214, 0.45)";
    ctx.beginPath();
    ctx.ellipse(plat.x + plat.w * 0.3, plat.y + 28, 16, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(plat.x + plat.w * 0.7, plat.y + 30, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (plat.mover) {
      ctx.fillStyle = "#6a2748";
      const faceX = plat.x + plat.w * 0.5;
      const faceY = plat.y + 16;
      ctx.beginPath();
      ctx.arc(faceX - 12, faceY, 3.1, 0, Math.PI * 2);
      ctx.arc(faceX + 12, faceY, 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6a2748";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(faceX, faceY + 4, 8, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStep(plat) {
    ctx.save();
    roundRect(ctx, plat.x, plat.y, plat.w, 34, 16);
    const g = ctx.createLinearGradient(plat.x, plat.y, plat.x, plat.y + 34);
    g.addColorStop(0, "#fff7fb");
    g.addColorStop(0.42, "#ffb7d8");
    g.addColorStop(0.58, "#ffe08a");
    g.addColorStop(1, "#ff9ec8");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function drawPad(pad) {
    const squish = pad.squish || 0;
    const h = 20 * (1 - squish * 0.55);
    ctx.save();
    ctx.fillStyle = "#ff7eb6";
    roundRect(ctx, pad.x, pad.y - h, pad.w, h + 8, 12);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(pad.x + pad.w / 2, pad.y - h - 10);
    ctx.lineTo(pad.x + pad.w / 2 - 8, pad.y - h + 2);
    ctx.lineTo(pad.x + pad.w / 2 + 8, pad.y - h + 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSpinner(sp) {
    const seg = spinnerPose(sp);
    ctx.save();
    ctx.setLineDash([5, 8]);
    ctx.strokeStyle = "rgba(255, 140, 186, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, sp.len, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
    ctx.save();
    ctx.translate(seg.x1, seg.y1);
    ctx.rotate(ang);
    roundRect(ctx, 0, -sp.thick / 2, sp.len, sp.thick, sp.thick / 2);
    ctx.clip();
    for (let x = -sp.thick; x < sp.len + sp.thick; x += 14) {
      ctx.fillStyle = (Math.floor(x / 14) % 2 === 0) ? "#ff7eb6" : "#fff3b0";
      ctx.fillRect(x, -sp.thick, 14, sp.thick * 2);
    }
    ctx.restore();
    ctx.fillStyle = "#ff6fa5";
    ctx.beginPath();
    ctx.arc(seg.x2, seg.y2, sp.thick * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(seg.x2 - 3, seg.y2 - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    const gum = ctx.createRadialGradient(sp.x - 4, sp.y - 4, 2, sp.x, sp.y, 18);
    gum.addColorStop(0, "#fff");
    gum.addColorStop(1, "#ff8fba");
    ctx.fillStyle = gum;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6a2748";
    ctx.beginPath();
    ctx.arc(sp.x - 5, sp.y - 2, 1.8, 0, Math.PI * 2);
    ctx.arc(sp.x + 5, sp.y - 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFlag(flag) {
    const wave = Math.sin(animTime * 4 + flag.x) * 5;
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.fillRect(flag.x - 3, flag.y - 122, 6, 122);
    ctx.fillStyle = "#ffe56a";
    ctx.beginPath();
    ctx.arc(flag.x, flag.y - 128, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff7eb6";
    ctx.beginPath();
    ctx.moveTo(flag.x + 3, flag.y - 116);
    ctx.quadraticCurveTo(flag.x + 34, flag.y - 108 + wave, flag.x + 62, flag.y - 96 + wave);
    ctx.lineTo(flag.x + 3, flag.y - 78);
    ctx.fill();
    ctx.fillStyle = "#fff";
    drawStarShape(ctx, flag.x + 28, flag.y - 100 + wave * 0.3, 6, animTime);
    ctx.restore();
  }

  function drawStarItem(star, index) {
    if (star.got) return;
    const bob = Math.sin(animTime * 3 + index) * 6;
    ctx.save();
    ctx.fillStyle = "rgba(255, 214, 80, 0.35)";
    ctx.beginPath();
    ctx.arc(star.x, star.y + bob, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe56a";
    drawStarShape(ctx, star.x, star.y + bob, 16, animTime * 1.4 + index);
    ctx.fillStyle = "#fff";
    drawStarShape(ctx, star.x - 4, star.y + bob - 4, 5, animTime);
    ctx.restore();
  }

  function drawSea() {
    const y = level.killY - 30;
    ctx.save();
    ctx.fillStyle = THEMES[level.theme].sea;
    ctx.beginPath();
    ctx.moveTo(-40, y);
    for (let x = -40; x <= level.width + 40; x += 28) {
      ctx.lineTo(x, y + Math.sin(animTime * 1.6 + x * 0.02) * 10);
    }
    ctx.lineTo(level.width + 40, y + 220);
    ctx.lineTo(-40, y + 220);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(-40, y + 16);
    for (let x = -40; x <= level.width + 40; x += 28) {
      ctx.lineTo(x, y + 16 + Math.sin(animTime * 1.3 + x * 0.03) * 8);
    }
    ctx.lineTo(level.width + 40, y + 220);
    ctx.lineTo(-40, y + 220);
    ctx.fill();
    ctx.restore();
  }

  function drawEgg(x, y, opt) {
    const o = opt || {};
    const sc = o.scale || 1;
    const sx = o.sx || 1;
    const sy = o.sy || 1;
    const roll = o.roll || 0;
    const facing = o.facing || 1;
    const blink = o.blink;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.rotate(roll);
    ctx.scale(sx, sy);

    ctx.fillStyle = "rgba(120, 60, 90, 0.13)";
    ctx.beginPath();
    ctx.ellipse(0, 2, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(-20, -60, 20, 0);
    body.addColorStop(0, "#fff3b0");
    body.addColorStop(0.55, "#ffd0ea");
    body.addColorStop(1, "#ffb3d9");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -30, 24, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(-8, -40, 8, 5, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.beginPath();
    ctx.ellipse(0, -24, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffd6e8";
    ctx.beginPath();
    ctx.ellipse(-8, -6, 7, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(8, -6, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const look = facing * 2.4;
    if (blink) {
      ctx.strokeStyle = "#5a3148";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-9, -36, 5, 0.15, Math.PI - 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(9, -36, 5, 0.15, Math.PI - 0.15);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(-9, -36, 7.2, 8.2, 0, 0, Math.PI * 2);
      ctx.ellipse(9, -36, 7.2, 8.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3d2a3a";
      ctx.beginPath();
      ctx.arc(-9 + look, -35, 3.5, 0, Math.PI * 2);
      ctx.arc(9 + look, -35, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-10.5 + look, -36.5, 1.5, 0, Math.PI * 2);
      ctx.arc(7.5 + look, -36.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255, 130, 170, 0.55)";
    ctx.beginPath();
    ctx.ellipse(-16, -28, 4.2, 2.6, 0, 0, Math.PI * 2);
    ctx.ellipse(16, -28, 4.2, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#c45b78";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, -30, 6, 0.25, Math.PI - 0.25);
    ctx.stroke();

    ctx.save();
    ctx.translate(12, -58);
    ctx.fillStyle = "#ff6fa5";
    ctx.beginPath();
    ctx.ellipse(-9, 0, 10, 7, -0.5, 0, Math.PI * 2);
    ctx.ellipse(9, 0, 10, 7, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff4d88";
    ctx.beginPath();
    ctx.arc(0, 1, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff9ec4";
    ctx.beginPath();
    ctx.moveTo(-2, 4);
    ctx.quadraticCurveTo(-12, 16, -7, 20);
    ctx.quadraticCurveTo(-2, 12, 0, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(2, 4);
    ctx.quadraticCurveTo(13, 14, 8, 22);
    ctx.quadraticCurveTo(2, 12, 0, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.ellipse(-10, -2, 3, 2, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function eggPose() {
    const moving = player.onGround && Math.abs(player.vx) > 30;
    const roll = clamp(player.vx / PHYS.speed, -1, 1) * 0.18;
    const bob = moving ? Math.sin(animTime * 14) * 2.5 : Math.sin(animTime * 2) * 1.2;
    let sx = 1;
    let sy = 1;
    if (player.land > 0) {
      const k = player.land / 0.14;
      sx = 1 + 0.18 * k;
      sy = 1 - 0.2 * k;
    } else if (player.vy < -180) {
      sx = 0.92;
      sy = 1.12;
    } else if (moving) {
      const w = Math.sin(animTime * 14);
      sx = 1 + w * 0.04;
      sy = 1 - w * 0.04;
    }
    const blink = animTime % 3.6 > 3.42;
    return { roll, bob, sx, sy, blink, facing: player.facing };
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const alpha = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      if (p.kind === "heart") drawHeart(ctx, p.x, p.y, p.s, p.color);
      else if (p.kind === "text") {
        ctx.fillStyle = p.color;
        ctx.font = "700 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * alpha + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawWorld() {
    const theme = THEMES[level.theme];
    drawSea();
    for (let i = 0; i < level.platforms.length; i++) {
      const plat = level.platforms[i];
      if (plat.kind === "cake") drawCake(plat, i + level.theme);
      else if (plat.kind === "cloud") drawCloudPlat(plat);
      else drawStep(plat);
    }
    for (let i = 0; i < level.pads.length; i++) drawPad(level.pads[i]);
    for (let i = 0; i < level.spinners.length; i++) drawSpinner(level.spinners[i]);
    for (let i = 0; i < level.stars.length; i++) drawStarItem(level.stars[i], i);
    drawFlag(level.flag);

    const pose = eggPose();
    let bob = pose.bob;
    let roll = pose.roll;
    let sx = pose.sx;
    let sy = pose.sy;
    if (mode === "clear") {
      const hop = Math.abs(Math.sin(animTime * 6));
      bob = -hop * 18;
      roll = Math.sin(animTime * 6) * 0.2;
      sx = hop < 0.15 ? 1.12 : 0.94;
      sy = hop < 0.15 ? 0.88 : 1.08;
    }
    if (player.hitCd > 0 && Math.sin(animTime * 30) > 0) ctx.globalAlpha = 0.65;
    drawEgg(player.x, player.y + bob, {
      facing: pose.facing,
      roll,
      sx,
      sy,
      blink: pose.blink,
    });
    ctx.globalAlpha = 1;
    drawParticles();
  }

  function drawTitle() {
    const theme = THEMES[0];
    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(0.5, theme.sky[1]);
    g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
    drawHill("#ffc4e0", 0.2, cssH * 0.78, 28);
    drawHill("#b7f3c9", 0.4, cssH * 0.86, 18);

    const hop = Math.abs(Math.sin(animTime * 3));
    const leftRoom = cssW / 2 - 280;
    const side = leftRoom > 150;
    const feetX = side ? leftRoom * 0.55 : cssW * 0.5;
    const feetY = cssH - (side ? 36 : 20);
    ctx.save();
    ctx.translate(feetX, feetY);
    ctx.scale(side ? 2 : 1.55, side ? 2 : 1.55);
    ctx.fillStyle = "#ffb3d4";
    roundRect(ctx, -70, -8, 140, 36, 16);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(0, -6, 62, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    const squish = hop < 0.08;
    drawEgg(0, -hop * 26, {
      scale: 1,
      facing: 1,
      roll: Math.sin(animTime * 3) * 0.08,
      sx: squish ? 1.12 : 0.96,
      sy: squish ? 0.88 : 1.06,
      blink: animTime % 3.6 > 3.42,
    });
    ctx.restore();

    const sx = side ? cssW - 120 : cssW * 0.78;
    const sy = (side ? cssH * 0.72 : cssH - 120) - Math.sin(animTime * 2) * 10;
    ctx.fillStyle = "#ffe56a";
    drawStarShape(ctx, sx, sy, 16, animTime);
  }

  function drawFinale() {
    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, "#ffe0f2");
    g.addColorStop(0.5, "#fff6d0");
    g.addColorStop(1, "#d9f8ea");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
    for (let i = 0; i < confetti.length; i++) {
      const c = confetti[i];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      if (c.heart) drawHeart(ctx, 0, 0, 8, c.color);
      else {
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      }
      ctx.restore();
    }
    const beat = animTime * 5;
    const hop = Math.pow(Math.abs(Math.sin(beat)), 1.15);
    const feetY = Math.min(cssH - 20, Math.max(cssH * 0.72, 360));
    ctx.save();
    ctx.translate(cssW * 0.5, feetY);
    ctx.scale(2.1, 2.1);
    const landed = hop < 0.12;
    drawEgg(0, -hop * 28, {
      facing: 1,
      roll: Math.sin(beat) * 0.22,
      sx: landed ? 1.16 : 0.92,
      sy: landed ? 0.84 : 1.1,
      blink: false,
    });
    if (landed) drawHeart(ctx, 26, -70, 8, "#ff8fba");
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (mode === "title") {
      cam.x = animTime * 20;
      drawTitle();
      return;
    }
    if (mode === "finale") {
      drawFinale();
      return;
    }
    drawSky(THEMES[level.theme]);
    const scale = viewScale();
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -cam.x * scale * dpr, -cam.y * scale * dpr);
    drawWorld();
  }

  function update(dt) {
    animTime += dt;
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove("show");
    }
    updateParticles(dt);
    if ((mode === "play" || mode === "clear") && level) {
      if (mode === "play") updatePlay(dt);
      updateCamera(mode === "play" ? dt : 0);
    }
    if (mode === "finale" && Math.random() < dt * 6) {
      burstHearts(cssW * 0.5 + (Math.random() - 0.5) * 80, cssH * 0.72, 1);
    }
  }

  let last = 0;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;
    if (document.hidden) dt = 0;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function bindHold(button, key) {
    const down = (event) => {
      event.preventDefault();
      unlockAudio();
      held[key] = true;
      button.classList.add("held");
      if (button.setPointerCapture) {
        try { button.setPointerCapture(event.pointerId); } catch (e) { /* 有的浏览器会拒绝 */ }
      }
    };
    const up = () => {
      held[key] = false;
      button.classList.remove("held");
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  function onKeyDown(event) {
    const code = event.code;
    if (code === "Space" || code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight") {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(code);
    unlockAudio();
    if (mode === "title" && (code === "Enter" || code === "Space") && event.target === document.body) {
      startLevel(firstUncleared());
      return;
    }
    if (mode === "play" && isJumpCode(code)) bufferJump();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function boot() {
    loadSave();
    syncMute();
    resize();
    showScreen();
    renderLevelSelect();

    ui.mute.addEventListener("click", () => {
      unlockAudio();
      muted = !muted;
      storageSet(MUTE_KEY, muted ? "1" : "0");
      syncMute();
    });
    $("btn-start").addEventListener("click", () => {
      unlockAudio();
      startLevel(firstUncleared());
    });
    $("btn-next").addEventListener("click", () => startLevel(levelIndex + 1));
    $("btn-retry").addEventListener("click", () => startLevel(levelIndex));
    $("btn-home").addEventListener("click", goTitle);
    $("btn-again").addEventListener("click", () => {
      unlockAudio();
      replayAll();
    });
    $("btn-home-2").addEventListener("click", goTitle);

    bindHold(ui.btnLeft, "left");
    bindHold(ui.btnRight, "right");
    ui.btnJump.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      unlockAudio();
      if (mode === "play") bufferJump();
      ui.btnJump.classList.add("held");
    });
    const releaseJump = () => ui.btnJump.classList.remove("held");
    ui.btnJump.addEventListener("pointerup", releaseJump);
    ui.btnJump.addEventListener("pointercancel", releaseJump);
    ui.btnJump.addEventListener("contextmenu", (event) => event.preventDefault());

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => {
      keys.clear();
      held.left = false;
      held.right = false;
      ui.btnLeft.classList.remove("held");
      ui.btnRight.classList.remove("held");
      ui.btnJump.classList.remove("held");
    });
    window.addEventListener("resize", resize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);

    requestAnimationFrame(frame);
  }

  boot();
})();
