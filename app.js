/* Study Pods — renders episodes.json and runs the audio player. No build step. */

// Accent colours per class. Unknown classes get a stable colour from FALLBACK.
const CLASS_COLORS = {
  "ECON 380": "#f2a65a",
  "ECON 381": "#e9c46a",
  "IHUM 242": "#c9a3e6",
};
const FALLBACK = ["#7fc8a9", "#f28482", "#84a9f2", "#f6bd60", "#9ad1d4", "#e5989b"];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const STORE = "studypods.v1";

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
};

const $ = (id) => document.getElementById(id);
const audio = $("audio");

let episodes = [];
let current = null;   // episode object currently loaded
let filter = "All";
let state = load();   // { speed, progress: { [id]: { t, done } } }

/* ---------- storage ---------- */

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.progress) return s;
  } catch {}
  return { speed: 1, progress: {} };
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
}
const progressOf = (id) => state.progress[id] || { t: 0, done: false };

/* ---------- helpers ---------- */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function colorFor(cls) {
  if (CLASS_COLORS[cls]) return CLASS_COLORS[cls];
  let h = 0;
  for (const ch of cls) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

function clock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : m) + ":" + String(s).padStart(2, "0");
}
function mins(sec) {
  const m = Math.round(sec / 60);
  return m < 1 ? "<1 min" : m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`;
}
function niceDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ---------- rendering ---------- */

function render() {
  const classes = [...new Set(episodes.map((e) => e.class))];

  // Greeting + stats
  const hr = new Date().getHours();
  const part = hr < 5 ? "Late night" : hr < 12 ? "Morning" : hr < 18 ? "Afternoon" : "Evening";
  $("hello").innerHTML = `${part} study <em>session.</em>`;
  const total = episodes.reduce((a, e) => a + (e.duration_seconds || 0), 0);
  const done = episodes.filter((e) => progressOf(e.id).done).length;
  $("stats").textContent = `${episodes.length} episode${episodes.length === 1 ? "" : "s"} · ${mins(total)} of listening · ${done} finished`;

  // Filter chips
  $("chips").innerHTML = ["All", ...classes]
    .map((c) => `<button class="chip" aria-pressed="${c === filter}" data-filter="${esc(c)}">${esc(c)}</button>`)
    .join("");

  // Sections (one per class, in order of their newest episode)
  $("classes").innerHTML = classes
    .filter((c) => filter === "All" || c === filter)
    .map((c, i) => {
      const eps = episodes.filter((e) => e.class === c);
      return `<section class="class" style="--accent:${colorFor(c)};animation-delay:${i * 60}ms">
        <div class="class-head"><span class="dot"></span><h2>${esc(c)}</h2><small>${eps.length} ep${eps.length === 1 ? "" : "s"}</small></div>
        <div class="list">${eps.map(card).join("")}</div>
      </section>`;
    })
    .join("");

  $("empty").hidden = episodes.length > 0;
  renderResume();
  markCurrent();
  requestAnimationFrame(() => document.body.classList.add("ready")); // entrance animation only once
}

function card(e) {
  const p = progressOf(e.id);
  const dur = e.duration_seconds || 0;
  const pct = p.done ? 100 : dur ? Math.min(100, (p.t / dur) * 100) : 0;
  const status = p.done
    ? `<span class="state done">✓ Played</span>`
    : p.t > 5 ? `<span class="state">${mins(dur - p.t)} left</span>`
    : `<span class="state">New</span>`;
  return `<button class="ep" data-id="${esc(e.id)}">
    <span class="ep-art"><img src="${esc(e.art_url)}" alt="" loading="lazy"></span>
    <span class="ep-body">
      <p class="ep-title">${esc(e.title)}</p>
      <span class="ep-meta">${status}<span>·</span><span>${niceDate(e.date)}</span><span>·</span><span>${mins(dur)}</span></span>
      <span class="bar"><span style="width:${pct}%"></span></span>
    </span>
    <span class="ep-go">${ICON.play}<span class="eq"><i></i><i></i><i></i></span></span>
  </button>`;
}

function renderResume() {
  // Most recently touched, unfinished episode that isn't currently loaded.
  const e = episodes
    .filter((x) => x !== current && !progressOf(x.id).done && progressOf(x.id).t > 5)
    .sort((a, b) => (progressOf(b.id).at || 0) - (progressOf(a.id).at || 0))[0];
  const el = $("resume");
  el.hidden = !e;
  if (!e) return;
  const p = progressOf(e.id);
  el.style.setProperty("--accent", colorFor(e.class));
  el.dataset.id = e.id;
  el.innerHTML = `<img src="${esc(e.art_url)}" alt="">
    <span class="info"><span class="label">Continue listening</span>
    <span class="h3">${esc(e.title)}</span>
    <span class="bar"><span style="width:${(p.t / (e.duration_seconds || 1)) * 100}%"></span></span></span>
    <span class="ep-go">${ICON.play}</span>`;
}

function markCurrent() {
  document.querySelectorAll(".ep").forEach((el) => {
    const on = current && el.dataset.id === current.id;
    el.classList.toggle("is-current", on);
    el.classList.toggle("is-playing", on && !audio.paused);
  });
}

/* ---------- player ---------- */

function open(e, autoplay = true) {
  if (current !== e) {
    current = e;
    const p = progressOf(e.id);
    audio.src = e.audio_url;
    audio.playbackRate = state.speed;
    // Resume from saved spot (restart if it was finished or within 5s of the end).
    const resumeAt = p.done ? 0 : p.t;
    audio.addEventListener("loadedmetadata", () => {
      if (resumeAt && resumeAt < audio.duration - 5) audio.currentTime = resumeAt;
      audio.playbackRate = state.speed;
    }, { once: true });

    const accent = colorFor(e.class);
    document.documentElement.style.setProperty("--accent", accent);
    $("miniArt").src = $("sheetArt").src = e.art_url;
    $("sheetBg").style.backgroundImage = `url("${e.art_url}")`;
    $("miniTitle").textContent = $("sheetTitle").textContent = e.title;
    $("miniClass").textContent = e.class;
    $("sheetClass").textContent = `${e.class} · ${niceDate(e.date)}`;
    $("sheetDesc").textContent = e.description || "";
    $("mini").hidden = false;
    setMediaSession(e);
    renderResume();
  }
  if (autoplay) audio.play().catch(() => {});
  markCurrent();
}

function persist(force) {
  if (!current || !isFinite(audio.duration)) return;
  const p = state.progress[current.id] || {};
  p.t = audio.currentTime;
  p.at = Date.now();
  if (audio.duration - audio.currentTime < 5) p.done = true;
  state.progress[current.id] = p;
  if (force || !persist.last || Date.now() - persist.last > 4000) {
    save();
    persist.last = Date.now();
  }
}

function syncPlayIcons() {
  const icon = audio.paused ? ICON.play : ICON.pause;
  $("miniPlay").innerHTML = $("play").innerHTML = icon;
  const label = audio.paused ? "Play" : "Pause";
  $("miniPlay").setAttribute("aria-label", label);
  $("play").setAttribute("aria-label", label);
  $("sheet").classList.toggle("playing", !audio.paused);
  markCurrent();
}

function syncTime() {
  const d = audio.duration || current?.duration_seconds || 0;
  const t = audio.currentTime;
  const pct = d ? (t / d) * 100 : 0;
  $("miniBar").style.width = pct + "%";
  if (!seeking) {
    $("seek").value = d ? (t / d) * 1000 : 0;
    $("seek").style.setProperty("--p", pct + "%");
  }
  $("cur").textContent = clock(t);
  $("left").textContent = "-" + clock((d - t) / (audio.playbackRate || 1));
}

function skip(sec) {
  if (!current) return;
  audio.currentTime = Math.max(0, Math.min((audio.duration || 0) - 0.1, audio.currentTime + sec));
}

function setSpeed(s) {
  state.speed = s;
  audio.playbackRate = s;
  save();
  const btn = $("speed");
  btn.textContent = `${s}×`;
  btn.classList.remove("bump");
  void btn.offsetWidth;
  btn.classList.add("bump");
  syncTime();
}

function setMediaSession(e) {
  if (!("mediaSession" in navigator)) return;
  const art = new URL(e.art_url, location.href).href;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: e.title, artist: e.class, album: "Study Pods",
    artwork: [{ src: art, sizes: "600x600" }],
  });
}

function toggleSheet(show) {
  $("sheet").classList.toggle("open", show);
  $("sheet").setAttribute("aria-hidden", String(!show));
  document.body.style.overflow = show ? "hidden" : "";
}

/* ---------- events ---------- */

let seeking = false;

document.addEventListener("click", (ev) => {
  const chip = ev.target.closest("[data-filter]");
  if (chip) { filter = chip.dataset.filter; render(); return; }

  const ep = ev.target.closest(".ep, #resume");
  if (ep) {
    const e = episodes.find((x) => x.id === ep.dataset.id);
    if (!e) return;
    if (e === current) audio.paused ? audio.play() : audio.pause();
    else { open(e); toggleSheet(true); }
  }
});

$("miniOpen").onclick = () => toggleSheet(true);
$("sheetClose").onclick = () => toggleSheet(false);
$("miniPlay").onclick = $("play").onclick = () => (audio.paused ? audio.play() : audio.pause());
$("back").onclick = () => skip(-15);
$("fwd").onclick = () => skip(15);
$("restart").onclick = () => { audio.currentTime = 0; audio.play(); };
$("speed").onclick = () => setSpeed(SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length] ?? 1);

const seek = $("seek");
seek.oninput = () => {
  seeking = true;
  const d = audio.duration || 0;
  seek.style.setProperty("--p", seek.value / 10 + "%");
  $("cur").textContent = clock((seek.value / 1000) * d);
};
seek.onchange = () => {
  if (isFinite(audio.duration)) audio.currentTime = (seek.value / 1000) * audio.duration;
  seeking = false;
};

audio.addEventListener("timeupdate", () => { syncTime(); persist(); });
audio.addEventListener("play", syncPlayIcons);
audio.addEventListener("pause", () => { syncPlayIcons(); persist(true); render(); });
audio.addEventListener("ended", () => {
  if (current) { state.progress[current.id] = { t: 0, done: true, at: Date.now() }; save(); }
  render();
});
addEventListener("pagehide", () => persist(true));
document.addEventListener("visibilitychange", () => document.hidden && persist(true));

// Desktop niceties: space to play/pause, arrows to skip, Esc to close.
document.addEventListener("keydown", (ev) => {
  if (!current || ev.target.matches("input, textarea")) return;
  if (ev.code === "Space") { ev.preventDefault(); audio.paused ? audio.play() : audio.pause(); }
  else if (ev.key === "ArrowLeft") skip(-15);
  else if (ev.key === "ArrowRight") skip(15);
  else if (ev.key === "Escape") toggleSheet(false);
});

if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => audio.play());
  ms.setActionHandler("pause", () => audio.pause());
  ms.setActionHandler("seekbackward", () => skip(-15));
  ms.setActionHandler("seekforward", () => skip(15));
  try { ms.setActionHandler("seekto", (d) => { audio.currentTime = d.seekTime; }); } catch {}
}

/* ---------- boot ---------- */

$("speed").textContent = `${state.speed}×`;
syncPlayIcons();

fetch("episodes.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((data) => {
    episodes = data.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    render();
  })
  .catch(() => {
    $("empty").hidden = false;
    $("empty").textContent = "Couldn't load episodes.json.";
  });
