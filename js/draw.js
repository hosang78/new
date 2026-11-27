/* 내가 그리는 수협의 미래 — 휴대폰 그림판 */
(function () {
  "use strict";
  const cfg = window.APP_CONFIG || {};
  const API_URL = /^https:\/\//.test(cfg.DRAW_API_URL || "") ? cfg.DRAW_API_URL : "";
  const W = 1200, H = 1600;                        // 저장 해상도 (세로 3:4)
  const COLORS = [
    ["#1d2b45", "먹색"], ["#0b3c6b", "깊은 바다"], ["#1f6fb2", "수협 파랑"], ["#5ab4e5", "하늘"],
    ["#2f9e8f", "청록"], ["#43a047", "초록"], ["#ffd166", "노랑"], ["#f08a4b", "주황"],
    ["#e04a3f", "빨강"], ["#f4a3c0", "분홍"], ["#8a6ad1", "보라"], ["#9a6b45", "갈색"]
  ];
  const SIZES = [6, 12, 24, 44];                    // 저장 해상도 기준 굵기(px)
  const store = window.API.store;
  const deviceId = window.API.participantId();
  const $ = id => document.getElementById(id);

  /* ---------- 상태 ---------- */
  // ops: 지금 그림을 만드는 동작 목록 ({type:'stroke', n} | {type:'clear'}), redo: 되돌린 동작
  // all: 지금까지 그린 모든 선 (n → 선), timeline: 모든 동작 기록 (재생용)
  let S = blank();
  function blank() {
    return { t0: Date.now(), ops: [], redo: [], all: [], timeline: [], tool: "pen", color: COLORS[0][0], size: 1, submissionId: null };
  }
  const now = () => Date.now() - S.t0;

  /* ---------- 저장(임시) ---------- */
  let saveT = null;
  function saveDraft() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      saveT = null;
      try { localStorage.setItem("sgr-draw-draft", JSON.stringify(S)); } catch (e) { /* 공간 부족 등: 무시 */ }
    }, 600);
  }
  function flushDraft() {
    if (!saveT) return;
    clearTimeout(saveT); saveT = null;
    try { localStorage.setItem("sgr-draw-draft", JSON.stringify(S)); } catch (e) {}
  }
  window.addEventListener("pagehide", flushDraft);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushDraft(); });
  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem("sgr-draw-draft") || "null");
      if (d && Array.isArray(d.ops) && Array.isArray(d.all)) S = Object.assign(blank(), d);
    } catch (e) {}
  }
  function clearDraft() { try { localStorage.removeItem("sgr-draw-draft"); } catch (e) {} }

  /* ---------- 화면 전환 ---------- */
  const screens = ["intro", "board", "finish", "sending", "done"];
  function show(id) {
    screens.forEach(s => { $(s).hidden = s !== id; });
    const el = $(id); el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter");
    if (id === "board") requestAnimationFrame(fit);
  }

  /* ---------- 캔버스 ---------- */
  const cv = $("cv"), ctx = cv.getContext("2d");
  const base = document.createElement("canvas"), bctx = base.getContext("2d");
  let k = 1;                                         // 화면 픽셀 / 저장 좌표
  function fit() {
    const stage = $("stage"), paper = $("paper");
    const cs = getComputedStyle(stage);
    const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
    const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 8;
    let w = Math.min(aw, ah * 3 / 4); w = Math.max(120, Math.floor(w));
    const h = Math.floor(w * 4 / 3);
    paper.style.width = w + "px"; paper.style.height = h + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = base.width = Math.round(w * dpr);
    cv.height = base.height = Math.round(h * dpr);
    k = cv.width / W;
    rebuild();
  }
  window.addEventListener("resize", () => { if (!$("board").hidden) fit(); });

  function visible() {
    let list = [];
    S.ops.forEach(o => { if (o.type === "clear") list = []; else list.push(S.all[o.n]); });
    return list;
  }
  function paintStroke(c, s, scale) {
    const p = s.points; if (!p.length) return;
    c.save();
    c.scale(scale, scale);
    c.strokeStyle = c.fillStyle = s.tool === "eraser" ? "#ffffff" : s.color;
    c.lineWidth = s.width; c.lineCap = "round"; c.lineJoin = "round";
    if (p.length === 1) { c.beginPath(); c.arc(p[0][0], p[0][1], s.width / 2, 0, Math.PI * 2); c.fill(); c.restore(); return; }
    c.beginPath(); c.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
      c.quadraticCurveTo(p[i][0], p[i][1], mx, my);
    }
    const L = p[p.length - 1]; c.lineTo(L[0], L[1]); c.stroke();
    c.restore();
  }
  function rebuild() {
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.fillStyle = "#fff"; bctx.fillRect(0, 0, base.width, base.height);
    visible().forEach(s => paintStroke(bctx, s, k));
    present();
    updateTools();
  }
  let cur = null, raf = 0;
  function present() {
    raf = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    if (cur) paintStroke(ctx, cur, k);
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(present); };

  /* ---------- 그리기 (포인터) ---------- */
  let pid = null;
  function toPoint(e) {
    const r = cv.getBoundingClientRect();
    const x = Math.max(0, Math.min(W, (e.clientX - r.left) / r.width * W));
    const y = Math.max(0, Math.min(H, (e.clientY - r.top) / r.height * H));
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, now()];
  }
  cv.addEventListener("pointerdown", e => {
    if (pid !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    pid = e.pointerId;
    try { cv.setPointerCapture(pid); } catch (err) {}
    closeSizes();
    cur = { n: S.all.length, tool: S.tool, color: S.tool === "eraser" ? "#ffffff" : S.color, width: SIZES[S.size] * (S.tool === "eraser" ? 1.6 : 1), points: [toPoint(e)] };
    $("hint").classList.add("gone");
    schedule();
    e.preventDefault();
  });
  cv.addEventListener("pointermove", e => {
    if (e.pointerId !== pid || !cur) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const p = toPoint(ev), L = cur.points[cur.points.length - 1];
      if (Math.hypot(p[0] - L[0], p[1] - L[1]) >= 1.5) cur.points.push(p);
    }
    schedule();
    e.preventDefault();
  });
  function endStroke(e) {
    if (e.pointerId !== pid) return;
    pid = null;
    if (!cur) return;
    const s = cur; cur = null;
    S.all.push(s);
    S.ops.push({ type: "stroke", n: s.n });
    S.redo = [];
    S.timeline.push({ type: "stroke", t: s.points[0][2], n: s.n });
    paintStroke(bctx, s, k);
    present(); updateTools(); saveDraft();
    if (navigator.vibrate) { try { navigator.vibrate(4); } catch (err) {} }
  }
  cv.addEventListener("pointerup", endStroke);
  cv.addEventListener("pointercancel", endStroke);

  /* ---------- 도구 ---------- */
  const sw = $("swatches");
  COLORS.forEach(([c, name]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "sw"; b.style.background = c;
    b.setAttribute("role", "radio"); b.setAttribute("aria-label", name); b.dataset.c = c;
    b.addEventListener("click", () => { S.color = c; S.tool = "pen"; updateTools(); saveDraft(); });
    sw.appendChild(b);
  });
  const sizes = $("sizes");
  SIZES.forEach((w, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-label", ["가늘게", "보통", "굵게", "아주 굵게"][i]);
    const d = document.createElement("i"); const px = [5, 9, 16, 26][i]; d.style.width = d.style.height = px + "px";
    b.appendChild(d);
    b.addEventListener("click", () => { S.size = i; closeSizes(); updateTools(); saveDraft(); });
    sizes.appendChild(b);
  });
  function closeSizes() { sizes.hidden = true; $("sizeBtn").setAttribute("aria-expanded", "false"); }
  $("sizeBtn").addEventListener("click", () => { sizes.hidden = !sizes.hidden; $("sizeBtn").setAttribute("aria-expanded", String(!sizes.hidden)); });
  $("penBtn").addEventListener("click", () => { S.tool = "pen"; updateTools(); });
  $("eraserBtn").addEventListener("click", () => { S.tool = "eraser"; updateTools(); });
  $("undoBtn").addEventListener("click", () => {
    if (!S.ops.length) return;
    S.redo.push(S.ops.pop()); S.timeline.push({ type: "undo", t: now() });
    rebuild(); saveDraft();
  });
  $("redoBtn").addEventListener("click", () => {
    if (!S.redo.length) return;
    S.ops.push(S.redo.pop()); S.timeline.push({ type: "redo", t: now() });
    rebuild(); saveDraft();
  });
  $("clearBtn").addEventListener("click", () => { if (visible().length) $("clearSheet").hidden = false; });
  $("clearNo").addEventListener("click", () => { $("clearSheet").hidden = true; });
  $("clearYes").addEventListener("click", () => {
    $("clearSheet").hidden = true;
    S.ops.push({ type: "clear" }); S.redo = []; S.timeline.push({ type: "clear", t: now() });
    rebuild(); saveDraft();
  });
  function updateTools() {
    [...sw.children].forEach(b => b.setAttribute("aria-checked", String(S.tool === "pen" && b.dataset.c === S.color)));
    [...sizes.children].forEach((b, i) => b.setAttribute("aria-checked", String(i === S.size)));
    $("penBtn").setAttribute("aria-pressed", String(S.tool === "pen"));
    $("eraserBtn").setAttribute("aria-pressed", String(S.tool === "eraser"));
    const dot = $("sizeDot");
    dot.style.setProperty("--d", [6, 9, 14, 20][S.size] + "px");
    dot.style.setProperty("--c", S.tool === "eraser" ? "#fff" : S.color);
    $("undoBtn").disabled = !S.ops.length;
    $("redoBtn").disabled = !S.redo.length;
    $("clearBtn").disabled = !visible().length;
    $("hint").classList.toggle("gone", visible().length > 0 || S.all.length > 0);
  }

  /* ---------- 내보내기 ---------- */
  function exportPNG(maxW) {
    const c = document.createElement("canvas");
    const scale = maxW ? maxW / W : 1;
    c.width = Math.round(W * scale); c.height = Math.round(H * scale);
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    visible().forEach(s => paintStroke(x, s, scale));
    return c.toDataURL("image/png");
  }
  function buildData() {
    const vis = visible();
    const visSet = new Set(vis.map(s => s.n));
    const pick = s => ({ n: s.n, tool: s.tool, color: s.color, width: s.width, points: s.points });
    const allPts = S.all.flatMap(s => s.points);
    const ts = allPts.map(p => p[2]);
    const drawMs = S.all.reduce((a, s) => a + (s.points[s.points.length - 1][2] - s.points[0][2]), 0);
    const stats = {
      strokeCount: vis.length, totalStrokes: S.all.length,
      pointCount: vis.reduce((a, s) => a + s.points.length, 0),
      undoCount: S.timeline.filter(e => e.type === "undo").length,
      clearCount: S.timeline.filter(e => e.type === "clear").length,
      drawSeconds: Math.round(drawMs / 100) / 10,
      sessionSeconds: ts.length ? Math.round((Math.max.apply(null, ts) - Math.min.apply(null, ts)) / 100) / 10 : 0,
      colorsUsed: [...new Set(vis.filter(s => s.tool === "pen").map(s => s.color))]
    };
    return {
      stats,
      strokes: {
        canvas: { width: W, height: H, background: "#ffffff", origin: "top-left", unit: "px" },
        strokes: vis.map(pick),
        removedStrokes: S.all.filter(s => !visSet.has(s.n)).map(pick),
        timeline: S.timeline,
        stats
      }
    };
  }

  /* ---------- 제목·제출 ---------- */
  $("toFinish").addEventListener("click", () => {
    if (!visible().length) { toastHint(); return; }
    $("preview").src = exportPNG(600);
    show("finish");
  });
  function toastHint() {
    const h = $("hint"); h.classList.remove("gone");
    h.querySelector("span").textContent = "먼저 그림을 그려 주세요!";
    h.animate && h.animate([{ transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "none" }], { duration: 300 });
  }
  $("finishBack").addEventListener("click", () => show("board"));
  $("moreDraw").addEventListener("click", () => show("board"));
  $("boardBack").addEventListener("click", () => show("intro"));
  const title = $("title"), desc = $("desc");
  title.addEventListener("input", () => { $("titleCount").textContent = title.value.length; $("formErr").textContent = ""; });
  desc.addEventListener("input", () => { $("descCount").textContent = desc.value.length; });

  $("form").addEventListener("submit", e => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t) { $("formErr").textContent = "작품 제목을 적어 주세요."; title.focus(); return; }
    if (!S.submissionId) { S.submissionId = "S-" + deviceId + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); saveDraft(); }
    send();
  });
  $("retryBtn").addEventListener("click", () => send());
  $("backToFinish").addEventListener("click", () => show("finish"));

  let sending = false;
  async function send() {
    if (sending) return;
    sending = true;
    const t = title.value.trim().slice(0, 30), d = desc.value.trim().slice(0, 200);
    const png = exportPNG();
    $("bottleImg").src = exportPNG(240);
    $("sendTitle").textContent = "바다로 띄워 보내는 중…";
    $("sendMsg").textContent = "잠시만 기다려 주세요. 창을 닫지 마세요.";
    $("sendActions").hidden = true;
    $("sending").classList.remove("sail");
    show("sending");
    const data = buildData();
    const body = JSON.stringify({ action: "submit", submissionId: S.submissionId, deviceId, title: t, description: d, png, strokes: data.strokes, stats: data.stats });
    try {
      const res = await postWithRetry(body);
      sending = false;
      finish(res.id, t, res.already);
    } catch (err) {
      sending = false;
      $("sendTitle").textContent = "보내지 못했어요";
      $("sendMsg").textContent = (err && err.message) || "네트워크를 확인하고 다시 보내 주세요. 그린 그림은 그대로 있어요.";
      $("sendActions").hidden = false;
    }
  }
  async function postWithRetry(body) {
    if (!API_URL) { await wait(1600); return { id: "DEMO-" + String(Math.floor(Math.random() * 900) + 100), demo: true }; }
    let last = null;
    for (let i = 0; i < 4; i++) {
      if (i) { $("sendMsg").textContent = "파도가 높네요. 다시 보내는 중… (" + (i + 1) + "/4)"; await wait(1500 * Math.pow(2, i - 1) + Math.random() * 800); }
      let j;
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 60000);
        const r = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body, signal: ctl.signal, redirect: "follow" });
        clearTimeout(to);
        j = await r.json();
      } catch (e) {
        last = new Error("네트워크가 불안정해요. 잠시 후 [다시 보내기]를 눌러 주세요. 그린 그림은 그대로 있어요.");
        continue;
      }
      if (j.ok) return j;
      if (j.error === "bad" || j.error === "too_large") throw new Error(j.message || "보낼 수 없는 작품이에요.");
      last = new Error(j.message || "저장에 실패했어요. [다시 보내기]를 눌러 주세요.");   // busy · save_failed · server → 같은 제출ID로 재시도
    }
    throw last;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- 완료 ---------- */
  function finish(id, t, already) {
    const thumb = exportPNG(480);
    const done = { id, title: t, thumb, demo: !API_URL, at: Date.now() };
    try { localStorage.setItem("sgr-draw-done", JSON.stringify(done)); } catch (e) {
      try { localStorage.setItem("sgr-draw-done", JSON.stringify(Object.assign({}, done, { thumb: "" }))); } catch (e2) {}
    }
    clearDraft();
    $("sending").classList.add("sail");
    setTimeout(() => showDone(done, already), 900);
  }
  function showDone(d, already) {
    $("doneId").textContent = d.id;
    $("doneName").textContent = d.title || "";
    if (d.thumb) $("doneImg").src = d.thumb; else $("doneImg").hidden = true;
    if (already) {
      $("doneTitle").textContent = "이미 제출한 작품이 있어요";
      $("doneMsg").textContent = "한 사람당 한 작품만 받아요. 먼저 보낸 작품이 잘 도착해 있어요.";
    } else if (d.demo) {
      $("doneMsg").textContent = "데모 모드라 실제로 저장되지는 않았어요. (드라이브 미연결)";
    }
    $("demoReset").hidden = !d.demo;
    show("done");
    party();
  }
  $("demoReset").addEventListener("click", () => {
    try { localStorage.removeItem("sgr-draw-done"); } catch (e) {}
    S = blank(); title.value = ""; desc.value = ""; show("intro");
  });

  // 완료 축하: 물고기·거품·색종이
  function party() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = $("party"), x = c.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
    const Wd = c.width, Hd = c.height;
    const cols = ["#ffd166", "#f08a4b", "#5ab4e5", "#1f6fb2", "#f4a3c0", "#43a047", "#8a6ad1"];
    const parts = [];
    for (let i = 0; i < 90; i++) parts.push({ kind: i % 6 === 0 ? "fish" : "paper", x: Wd / 2 + (Math.random() - .5) * Wd * .3, y: Hd * .42,
      vx: (Math.random() - .5) * Wd * .022, vy: -(Math.random() * Hd * .022 + Hd * .008), a: Math.random() * 6, va: (Math.random() - .5) * .25,
      s: (Math.random() * 6 + 6) * dpr, c: cols[i % cols.length] });
    for (let i = 0; i < 26; i++) parts.push({ kind: "bubble", x: Math.random() * Wd, y: Hd + Math.random() * Hd * .3, vx: 0, vy: -(Math.random() * 2 + 1.5) * dpr, s: (Math.random() * 6 + 4) * dpr, a: 0, va: 0, c: "#5ab4e5" });
    const t0 = performance.now();
    (function frame(t) {
      const el = t - t0;
      x.clearRect(0, 0, Wd, Hd);
      if (el > 3600 || $("done").hidden) return;
      const fade = Math.max(0, 1 - Math.max(0, el - 2600) / 1000);
      parts.forEach(p => {
        if (p.kind !== "bubble") p.vy += Hd * .00055;
        p.x += p.vx + (p.kind === "bubble" ? Math.sin((el + p.s * 50) / 300) * .6 : 0); p.y += p.vy; p.a += p.va;
        x.save(); x.globalAlpha = fade; x.translate(p.x, p.y); x.rotate(p.a);
        if (p.kind === "paper") { x.fillStyle = p.c; x.fillRect(-p.s, -p.s * .4, p.s * 2, p.s * .8); }
        else if (p.kind === "fish") {
          x.fillStyle = p.c; x.strokeStyle = "#1d2b45"; x.lineWidth = 1.5 * dpr;
          x.beginPath(); x.ellipse(0, 0, p.s * 1.4, p.s * .8, 0, 0, Math.PI * 2); x.fill(); x.stroke();
          x.beginPath(); x.moveTo(p.s * 1.3, 0); x.lineTo(p.s * 2.2, -p.s * .7); x.lineTo(p.s * 2.2, p.s * .7); x.closePath(); x.fill(); x.stroke();
          x.fillStyle = "#1d2b45"; x.beginPath(); x.arc(-p.s * .7, -p.s * .15, p.s * .18, 0, Math.PI * 2); x.fill();
        } else { x.strokeStyle = "#5ab4e5"; x.lineWidth = 2 * dpr; x.beginPath(); x.arc(0, 0, p.s, 0, Math.PI * 2); x.stroke(); }
        x.restore();
      });
      requestAnimationFrame(frame);
    })(t0);
  }

  /* ---------- 시작 ---------- */
  $("modeNote").textContent = API_URL ? "드라이브 연결됨" : "데모 모드";
  $("startBtn").addEventListener("click", () => {
    if (!S.all.length) S.t0 = Date.now();
    show("board");
  });
  let doneInfo = null;
  try { doneInfo = JSON.parse(localStorage.getItem("sgr-draw-done") || "null"); } catch (e) {}
  if (doneInfo && doneInfo.id) {
    showDone(doneInfo, false);
    $("doneTitle").textContent = "이미 작품을 보냈어요";
    $("doneMsg").textContent = "한 사람당 한 작품만 받아요. 보낸 작품이 잘 도착해 있어요.";
  } else {
    loadDraft();
    if (S.all.length) $("startBtn").textContent = "이어서 그리기";
    updateTools();
  }
})();
