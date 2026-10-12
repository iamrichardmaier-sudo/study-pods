/* Map Quest: find each country on the map. Three misses and the answer is highlighted. */

const COUNTRIES = [
  // The 26 lettered countries on the IHUM 242 North Africa–Middle East map quiz.
  { id: "MAR", flag: "ma", name: "Morocco" },
  { id: "ESH", flag: "eh", name: "Western Sahara" },
  { id: "MRT", flag: "mr", name: "Mauritania" },
  { id: "DZA", flag: "dz", name: "Algeria" },
  { id: "MLI", flag: "ml", name: "Mali" },
  { id: "NER", flag: "ne", name: "Niger" },
  { id: "LBY", flag: "ly", name: "Libya" },
  { id: "TCD", flag: "td", name: "Chad" },
  { id: "EGY", flag: "eg", name: "Egypt" },
  { id: "SDN", flag: "sd", name: "Sudan" },
  { id: "YEM", flag: "ye", name: "Yemen" },
  { id: "OMN", flag: "om", name: "Oman" },
  { id: "ARE", flag: "ae", name: "United Arab Emirates" },
  { id: "SAU", flag: "sa", name: "Saudi Arabia" },
  { id: "JOR", flag: "jo", name: "Jordan" },
  { id: "ISR", flag: "il", name: "Israel" },
  { id: "LBN", flag: "lb", name: "Lebanon" },
  { id: "CYP", flag: "cy", name: "Cyprus" },
  { id: "SYR", flag: "sy", name: "Syria" },
  { id: "TUR", flag: "tr", name: "Turkey" },
  { id: "IRQ", flag: "iq", name: "Iraq" },
  { id: "IRN", flag: "ir", name: "Iran" },
  { id: "PAK", flag: "pk", name: "Pakistan" },
  { id: "AFG", flag: "af", name: "Afghanistan" },
  { id: "TKM", flag: "tm", name: "Turkmenistan" },
  { id: "UZB", flag: "uz", name: "Uzbekistan" },
  // The numbered small states on the same map ("Full region" mode).
  { id: "TUN", flag: "tn", name: "Tunisia", extra: true },
  { id: "KWT", flag: "kw", name: "Kuwait", extra: true },
  { id: "BHR", flag: "bh", name: "Bahrain", extra: true },
  { id: "QAT", flag: "qa", name: "Qatar", extra: true },
  { id: "GEO", flag: "ge", name: "Georgia", extra: true },
  { id: "ARM", flag: "am", name: "Armenia", extra: true },
  { id: "AZE", flag: "az", name: "Azerbaijan", extra: true },
  { id: "KGZ", flag: "kg", name: "Kyrgyzstan", extra: true },
  { id: "TJK", flag: "tj", name: "Tajikistan", extra: true },
];
// Names for neighbours that aren't in play, so a wrong click can still teach something.
const OTHER_NAMES = {
  PSE: "Palestine", ERI: "Eritrea", ETH: "Ethiopia", DJI: "Djibouti", SOM: "Somalia", SSD: "South Sudan",
  CAF: "Central African Rep.", NGA: "Nigeria", BFA: "Burkina Faso", SEN: "Senegal", GRC: "Greece", ESP: "Spain",
  ITA: "Italy", KAZ: "Kazakhstan", IND: "India", CHN: "China", RUS: "Russia", BGR: "Bulgaria", CMR: "Cameroon",
  BIR_TAWIL: "Bir Tawil", MLT: "Malta", PRT: "Portugal", GMB: "Gambia", GIN: "Guinea", CIV: "Côte d'Ivoire",
  BEN: "Benin", GHA: "Ghana", TGO: "Togo", NPL: "Nepal", UKR: "Ukraine", ROU: "Romania",
};
// Bodies of water, in lon/lat, to orient the player.
const SEAS = [
  ["Mediterranean Sea", 18, 34.6], ["Red Sea", 38.6, 19.6], ["Arabian Sea", 62, 16],
  ["Persian Gulf", 51.2, 26.9], ["Caspian Sea", 50.8, 41], ["Black Sea", 34, 43.3], ["Atlantic Ocean", -15, 30],
];

const SCORE = [100, 60, 30, 0];       // by number of misses before the correct click
const STORE = "ihum.mapquest.v1";
const SVGNS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const byId = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]));

const svg = $("map");
const D = window.MAP_DATA;
let store = load();
let mode = store.mode || "quiz";
let game = null;

/* ---------- storage ---------- */

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(store)); } catch {}
}

/* ---------- map ---------- */

const el = (tag, attrs) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
function project(lon, lat) {
  // Must match the projection in tools/build_map.py.
  const LON0 = -19, LON1 = 81, LAT0 = 6, LAT1 = 46;
  const merc = (l) => Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360));
  const k = D.w / (((LON1 - LON0) * Math.PI) / 180);
  return [((lon - LON0) * Math.PI / 180) * k, (merc(LAT1) - merc(lat)) * k];
}

const layers = {};
const shapes = {};   // id -> path
const dots = {};     // id -> circle for tiny countries
const centers = {};  // id -> [x, y]

function drawMap() {
  svg.setAttribute("viewBox", `0 0 ${D.w} ${D.h}`);
  for (const name of ["sea", "bg", "play", "labels", "dots", "fx"]) svg.appendChild((layers[name] = el("g", {})));
  for (const [name, lon, lat] of SEAS) {
    const [x, y] = project(lon, lat);
    const t = el("text", { x, y, class: "sea-label" });
    t.textContent = name;
    layers.sea.appendChild(t);
  }
  for (const id in D.paths) {
    const p = el("path", { d: D.paths[id], class: "bg", "data-id": id });
    shapes[id] = p;
    layers.bg.appendChild(p);
  }
}

// Move the countries in play onto the interactive layer, and give tiny ones a tap target.
function setupBoard(ids) {
  for (const id in shapes) {
    shapes[id].setAttribute("class", "bg");
    layers.bg.appendChild(shapes[id]);
  }
  layers.labels.replaceChildren();
  layers.dots.replaceChildren();
  for (const id of ids) {
    const p = shapes[id];
    p.setAttribute("class", "c");
    layers.play.appendChild(p);
    const b = p.getBBox();
    centers[id] = labelPoint(id, b);
    if (Math.max(b.width, b.height) < 24) {
      const d = el("circle", { cx: b.x + b.width / 2, cy: b.y + b.height / 2, r: 9, class: "dot-hit", "data-id": id });
      dots[id] = d;
      layers.dots.appendChild(d);
    } else delete dots[id];
  }
}

// Hand-tuned label spots for oddly shaped countries; everything else uses its bounding-box centre.
const LABEL_AT = { DZA: [2.5, 28], LBY: [17.5, 27], EGY: [29.5, 26.5], SDN: [30, 15.5], SAU: [45, 24], IRN: [54.5, 32.5], TUR: [34, 39], OMN: [56.5, 20.5], MAR: [-6.5, 31.8], MLI: [-2, 17.5], NER: [9.5, 17], TCD: [18.5, 15], PAK: [68.5, 28.5], AFG: [65.5, 33.5], IRQ: [43.5, 33], SYR: [38.5, 35], TKM: [58.8, 39.5], UZB: [63.5, 41.6], YEM: [47.5, 15.6], MRT: [-10.5, 20.5], ESH: [-13, 24.5] };
function labelPoint(id, b) {
  return LABEL_AT[id] ? project(...LABEL_AT[id]) : [b.x + b.width / 2, b.y + b.height / 2];
}

/* ---------- zoom + pan (viewBox) ---------- */

let vb = { x: 0, y: 0, w: 0, h: 0 };
function setVB(n) {
  const rect = svg.getBoundingClientRect();
  const aspect = rect.width / rect.height || D.w / D.h;
  // Fit the whole map, then never zoom out further than that.
  const fitW = Math.max(D.w, D.h * aspect);
  n.w = Math.min(fitW, Math.max(fitW / 10, n.w));
  n.h = n.w / aspect;
  const padX = Math.max(0, (n.w - D.w) / 2), padY = Math.max(0, (n.h - D.h) / 2);
  n.x = Math.min(Math.max(n.x, -padX), D.w - n.w + padX);
  n.y = Math.min(Math.max(n.y, -padY), D.h - n.h + padY);
  if (n.w >= D.w) n.x = (D.w - n.w) / 2;
  if (n.h >= D.h) n.y = (D.h - n.h) / 2;
  vb = n;
  svg.setAttribute("viewBox", `${n.x} ${n.y} ${n.w} ${n.h}`);
  svg.style.setProperty("--zoom", D.w / n.w);
}
function resetView() {
  // Phones in portrait start zoomed in a little (centred) so the countries aren't tiny.
  const r = svg.getBoundingClientRect();
  const aspect = r.width / r.height || 2;
  const w = aspect < 1 ? Math.max(D.h * aspect, D.w / 1.8) : Infinity;
  setVB({ x: (D.w - Math.min(w, D.w)) / 2, y: 0, w });
}
function panTo(x, y) { setVB({ ...vb, x: x - vb.w / 2, y: y - vb.h / 2 }); }
function toMap(cx, cy) {
  const r = svg.getBoundingClientRect();
  return [vb.x + ((cx - r.left) / r.width) * vb.w, vb.y + ((cy - r.top) / r.height) * vb.h];
}
function zoomAt(factor, cx, cy) {
  const r = svg.getBoundingClientRect();
  if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
  const [mx, my] = toMap(cx, cy);
  const w = vb.w / factor, fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
  setVB({ x: mx - fx * w, y: my - fy * (w * vb.h / vb.w), w });
}

const pointers = new Map();
let gesture = null; // { moved, startVB, startDist, startMid, downTarget }

svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), e.clientX, e.clientY);
}, { passive: false });

svg.addEventListener("pointerdown", (e) => {
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  svg.setPointerCapture(e.pointerId);
  if (pointers.size === 1) gesture = { moved: false, downTarget: e.target, start: [e.clientX, e.clientY], startVB: { ...vb } };
  else { gesture.moved = true; startPinch(); }
});
svg.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size >= 2) return pinch();
  const dx = e.clientX - gesture.start[0], dy = e.clientY - gesture.start[1];
  if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
  gesture.moved = true;
  svg.classList.add("dragging");
  const r = svg.getBoundingClientRect();
  setVB({ ...gesture.startVB, x: gesture.startVB.x - (dx / r.width) * vb.w, y: gesture.startVB.y - (dy / r.height) * vb.h });
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 1) {
    // Pinch ended with one finger still down: continue as a pan from here.
    const [p] = pointers.values();
    gesture.start = p; gesture.startVB = { ...vb };
    return;
  }
  if (pointers.size === 0) {
    svg.classList.remove("dragging");
    if (gesture && !gesture.moved && e.type === "pointerup") handleClick(gesture.downTarget, e.clientX, e.clientY);
    gesture = null;
  }
}
svg.addEventListener("pointerup", endPointer);
svg.addEventListener("pointercancel", endPointer);

function startPinch() {
  const [a, b] = [...pointers.values()];
  gesture.startDist = Math.hypot(a[0] - b[0], a[1] - b[1]);
  gesture.startMid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  gesture.startVB = { ...vb };
}
function pinch() {
  const [a, b] = [...pointers.values()];
  const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const r = svg.getBoundingClientRect();
  const s = gesture.startVB;
  const w = s.w * (gesture.startDist / dist);
  const h = w * s.h / s.w;
  // Keep the map point that was under the starting midpoint under the current midpoint.
  const mx = s.x + ((gesture.startMid[0] - r.left) / r.width) * s.w;
  const my = s.y + ((gesture.startMid[1] - r.top) / r.height) * s.h;
  setVB({ x: mx - ((mid[0] - r.left) / r.width) * w, y: my - ((mid[1] - r.top) / r.height) * h, w });
}

$("zoomIn").onclick = () => zoomAt(1.6);
$("zoomOut").onclick = () => zoomAt(1 / 1.6);
$("zoomReset").onclick = resetView;
addEventListener("resize", () => setVB({ ...vb }));

/* ---------- sound ---------- */

let actx = null;
function tone(notes, type = "sine", vol = 0.12) {
  if (store.muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    let t = actx.currentTime;
    for (const [f, d] of notes) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + d);
      t += d * 0.7;
    }
  } catch {}
}
const sfx = {
  good: () => tone([[660, .12], [990, .2]]),
  ok: () => tone([[520, .12], [700, .18]]),
  bad: () => tone([[180, .22]], "square", 0.05),
  reveal: () => tone([[300, .15], [240, .25]], "triangle", 0.1),
  win: () => tone([[523, .14], [659, .14], [784, .14], [1047, .4]], "triangle", 0.12),
};
const MUTE_ICON = {
  on: '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  off: '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>',
};
function renderMute() {
  $("mute").innerHTML = store.muted ? MUTE_ICON.off : MUTE_ICON.on;
  $("mute").setAttribute("aria-label", store.muted ? "Unmute sounds" : "Mute sounds");
}
$("mute").onclick = () => { store.muted = !store.muted; save(); renderMute(); };

/* ---------- game ---------- */

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const nameOf = (id) => byId[id]?.name || OTHER_NAMES[id];

function setFor(m) { return COUNTRIES.filter((c) => m === "full" || !c.extra).map((c) => c.id); }

function start(ids, practice = false) {
  const board = setFor(mode);
  setupBoard(board);
  game = {
    queue: shuffle([...ids]), i: 0, misses: 0, results: {}, score: 0,
    streak: 0, bestStreak: 0, started: Date.now(), practice, board, locked: false,
  };
  // In practice rounds, countries not being drilled start out as already done.
  for (const id of board) if (!ids.includes(id)) mark(id, "done");
  $("startScreen").hidden = $("endScreen").hidden = true;
  $("prompt").hidden = false;
  resetView();
  clearInterval(game.tick);
  game.tick = setInterval(renderHud, 500);
  next();
}

function mark(id, cls) {
  shapes[id].setAttribute("class", `c ${cls}`);
  dots[id]?.setAttribute("class", `dot-hit ${cls}`);
}

function next() {
  const id = game.queue[game.i];
  const c = byId[id];
  game.misses = 0;
  $("flag").src = `flags/${c.flag}.svg`;
  $("flag").alt = `Flag of ${c.name}`;
  $("target").textContent = c.name;
  const p = $("prompt");
  p.classList.remove("revealed", "next");
  void p.offsetWidth;
  p.classList.add("next");
  p.querySelector("small").textContent = "Click on";
  renderTries();
  renderHud();
}

function renderTries() {
  [...$("tries").children].forEach((d, i) => d.classList.toggle("used", i < game.misses));
}

function renderHud() {
  if (!game) return;
  $("progress").textContent = `${Object.keys(game.results).length}/${game.queue.length}`;
  $("score").textContent = game.score.toLocaleString();
  $("streak").textContent = game.streak;
  $("streakPill").classList.toggle("hot", game.streak >= 3);
  if (!game.over) $("timer").textContent = clock(Math.floor((Date.now() - game.started) / 1000));
}

function handleClick(target, cx, cy) {
  if (!game || game.over || game.locked) return;
  const id = target?.dataset?.id;
  if (!id) return; // clicked the sea
  const want = game.queue[game.i];

  if (id === want) return correct(id, cx, cy);
  if (game.misses >= 3) return; // answer is highlighted; only it can be clicked now

  game.misses++;
  game.streak = 0;
  sfx.bad();
  const p = $("prompt");
  p.classList.remove("shake"); void p.offsetWidth; p.classList.add("shake");
  const s = shapes[id];
  if (s && s.classList.contains("c")) {
    s.classList.remove("wrong"); void s.getBBox(); s.classList.add("wrong");
    setTimeout(() => s.classList.remove("wrong"), 700);
  }
  const n = nameOf(id);
  toast(n ? `That's ${n}` : "Not quite", "bad");
  renderTries();
  renderHud();
  if (game.misses >= 3) reveal(want);
}

function reveal(id) {
  sfx.reveal();
  mark(id, "reveal");
  const p = $("prompt");
  p.classList.add("revealed");
  p.querySelector("small").textContent = "Here it is, click it";
  // Bring it into view if the player has zoomed away from it.
  const [x, y] = centers[id];
  if (x < vb.x || x > vb.x + vb.w || y < vb.y || y > vb.y + vb.h) panTo(x, y);
}

function correct(id, cx, cy) {
  const m = game.misses;
  game.results[id] = m;
  let pts = SCORE[m];
  if (m === 0) {
    game.streak++;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    pts += Math.min(50, (game.streak - 1) * 10);
  }
  game.score += pts;
  mark(id, `done s${m + 1} correct`);
  setTimeout(() => shapes[id].classList.remove("correct"), 600);
  addLabel(id);
  floatText(pts ? `+${pts}` : "0", cx, cy, m);

  if (m === 0) {
    sfx.good();
    const hype = { 3: "On fire!", 5: "Unstoppable!", 8: "Cartographer!", 12: "Atlas mode!", 20: "Legendary!" }[game.streak];
    if (hype) toast(`🔥 ${game.streak} in a row: ${hype}`, "hot");
    $("streakPill").classList.remove("bump"); void $("streakPill").offsetWidth; $("streakPill").classList.add("bump");
  } else sfx.ok();

  game.i++;
  renderHud();
  if (game.i >= game.queue.length) return finish();
  game.locked = true;
  setTimeout(() => { game.locked = false; next(); }, 350);
}

function addLabel(id) {
  const b = shapes[id].getBBox();
  if (Math.max(b.width, b.height) < 34) return; // too small to fit a label
  const [x, y] = centers[id];
  const t = el("text", { x, y, class: "label" });
  t.textContent = byId[id].name.replace("United Arab Emirates", "UAE");
  layers.labels.appendChild(t);
}

function floatText(txt, cx, cy, misses) {
  const [x, y] = toMap(cx, cy);
  const scale = vb.w / D.w;
  const t = el("text", { x, y, class: "float", "font-size": 14 * scale * (svg.getBoundingClientRect().width < 600 ? 1.6 : 1) });
  t.style.fill = `var(--c${misses + 1})`;
  t.textContent = txt;
  layers.fx.appendChild(t);
  setTimeout(() => t.remove(), 1100);
}

let toastTimer;
function toast(msg, kind) {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

function finish() {
  game.over = true;
  clearInterval(game.tick);
  const time = Math.floor((Date.now() - game.started) / 1000);
  const n = game.queue.length;
  const first = Object.values(game.results).filter((m) => m === 0).length;
  const acc = Math.round((first / n) * 100);
  $("timer").textContent = clock(time);
  $("prompt").hidden = true;

  // Records are kept for full rounds only, not for practice rounds.
  let record = false;
  if (!game.practice) {
    store.best = store.best || {};
    const b = store.best[mode];
    if (!b || game.score > b.score || (game.score === b.score && time < b.time)) {
      record = true;
      store.best[mode] = { score: game.score, acc, time };
    }
    store.plays = (store.plays || 0) + 1;
    save();
  }

  $("endKicker").textContent = game.practice ? "Practice round" : mode === "full" ? "Full region" : "Quiz countries";
  $("endTitle").textContent = acc === 100 ? "Flawless. Every one first try." : acc >= 85 ? "Excellent map work!" : acc >= 60 ? "Solid round!" : "Good start. Run it again!";
  $("record").hidden = !record;
  $("rScore").textContent = game.score.toLocaleString();
  $("rAcc").textContent = `${acc}%`;
  $("rTime").textContent = clock(time);
  $("rStreak").textContent = game.bestStreak;

  // Misses first, so the review shows what to study.
  const order = [...game.queue].sort((a, b) => game.results[b] - game.results[a]);
  const tag = ["1st try", "2nd try", "3rd try", "missed"];
  $("review").innerHTML = order.map((id) => {
    const c = byId[id], m = game.results[id];
    return `<span style="--c:var(--c${m + 1})"><img src="flags/${c.flag}.svg" alt="">${c.name}<em>${tag[m]}</em></span>`;
  }).join("");
  const misses = game.queue.filter((id) => game.results[id] > 0);
  $("practiceBtn").disabled = misses.length === 0;
  $("practiceBtn").textContent = misses.length ? `Practice ${misses.length} miss${misses.length === 1 ? "" : "es"}` : "No misses!";
  game.misses_ = misses;

  setTimeout(() => {
    $("endScreen").hidden = false;
    sfx.win();
    if (acc >= 60) confetti(acc === 100 ? 220 : 120);
  }, 700);
}

/* ---------- confetti ---------- */

function confetti(count) {
  const cv = $("confetti"), ctx = cv.getContext("2d");
  const dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ["#c9a3e6", "#7fc8a9", "#f6d365", "#f2a65a", "#ffd38a", "#f6ead8"];
  const bits = Array.from({ length: count }, () => ({
    x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.6,
    vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2 + 1,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy = Math.min(b.vy + 0.12, 6); b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
    }
    if (t - t0 < 5000) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

/* ---------- menus ---------- */

function renderModes() {
  document.querySelectorAll(".mode").forEach((b) => b.setAttribute("aria-checked", b.dataset.mode === mode));
  document.querySelectorAll(".mode-best").forEach((s) => {
    const b = store.best?.[s.dataset.best];
    s.textContent = b ? `Best ${b.score.toLocaleString()} · ${b.acc}% · ${clock(b.time)}` : "";
  });
  $("progress").textContent = `0/${setFor(mode).length}`;
}
document.querySelectorAll(".mode").forEach((b) => b.onclick = () => {
  mode = b.dataset.mode; store.mode = mode; save(); renderModes();
  setupBoard(setFor(mode));
});
$("startBtn").onclick = () => start(setFor(mode));
$("againBtn").onclick = () => start(setFor(mode));
$("practiceBtn").onclick = () => start(game.misses_, true);
$("menuBtn").onclick = () => {
  $("endScreen").hidden = true;
  $("startScreen").hidden = false;
  game = null;
  $("prompt").hidden = true;
  setupBoard(setFor(mode));
  renderModes();
};
addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("startScreen").hidden) $("startBtn").click();
  else if (e.key === "Enter" && !$("endScreen").hidden) $("againBtn").click();
});

drawMap();
setupBoard(setFor(mode));
resetView();
renderModes();
renderMute();
