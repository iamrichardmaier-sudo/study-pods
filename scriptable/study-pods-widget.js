// Study Pods for Scriptable (iOS).
// Run in the app to browse episodes; add as a home-screen widget to see the latest ones.
// Tapping an episode opens it in the Study Pods player in Safari.

const SITE = "https://iamrichardmaier-sudo.github.io/study-pods/"; // must end with "/"

const CLASS_COLORS = { "ECON 380": "#f2a65a", "ECON 381": "#e9c46a", "IHUM 242": "#c9a3e6" };
const FALLBACK = ["#7fc8a9", "#f28482", "#84a9f2", "#f6bd60", "#9ad1d4", "#e5989b"];
const BG_TOP = new Color("#2a1c12");
const BG_BOTTOM = new Color("#120e0b");
const TEXT = new Color("#f6ead8");
const MUTED = new Color("#a8977f");
const AMBER = new Color("#f2a65a");

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "study-pods-episodes.json");

/* ---------- data ---------- */

async function loadEpisodes() {
  try {
    const req = new Request(SITE + "episodes.json?t=" + Date.now());
    const eps = await req.loadJSON();
    fm.writeString(cachePath, JSON.stringify(eps));
    return sortEps(eps);
  } catch (e) {
    // Offline: fall back to the last copy we fetched.
    if (fm.fileExists(cachePath)) return sortEps(JSON.parse(fm.readString(cachePath)));
    return [];
  }
}

const sortEps = (eps) => eps.sort((a, b) => String(b.date).localeCompare(String(a.date)));
const abs = (u) => (/^https?:/.test(u) ? u : SITE + u);
const link = (e) => SITE + "#ep=" + encodeURIComponent(e.id);

function colorFor(cls) {
  if (CLASS_COLORS[cls]) return CLASS_COLORS[cls];
  let h = 0;
  for (const ch of cls) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

function mins(sec) {
  const m = Math.round((sec || 0) / 60);
  return m < 1 ? "<1 min" : m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`;
}

function niceDate(iso) {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d)) return iso;
  const f = new DateFormatter();
  f.dateFormat = "MMM d";
  return f.string(d);
}

// Scriptable can't render SVG, so SVG covers fall back to a coloured tile.
async function loadArt(e) {
  if (!e.art_url || /\.svg(\?|$)/i.test(e.art_url)) return null;
  try { return await new Request(abs(e.art_url)).loadImage(); } catch { return null; }
}

/* ---------- widget ---------- */

function addArt(stack, img, e, size) {
  if (img) {
    const wi = stack.addImage(img);
    wi.imageSize = new Size(size, size);
    wi.cornerRadius = size * 0.22;
    return;
  }
  const tile = stack.addStack();
  tile.size = new Size(size, size);
  tile.cornerRadius = size * 0.22;
  tile.backgroundColor = new Color(colorFor(e.class));
  tile.centerAlignContent();
  const t = tile.addText(e.class.replace(/[^0-9]/g, "") || e.class.slice(0, 3));
  t.font = Font.heavySystemFont(size * 0.3);
  t.textColor = BG_BOTTOM;
}

async function buildWidget(eps) {
  const family = config.widgetFamily || "medium";
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [BG_TOP, BG_BOTTOM];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(14, 14, 14, 14);
  w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);

  const head = w.addText("STUDY PODS");
  head.font = Font.heavySystemFont(10);
  head.textColor = AMBER;
  w.addSpacer(8);

  if (!eps.length) {
    const t = w.addText("No episodes yet");
    t.font = Font.mediumSystemFont(13);
    t.textColor = MUTED;
    return w;
  }

  if (family === "small") {
    const e = eps[0];
    w.url = link(e);
    addArt(w.addStack(), await loadArt(e), e, 44);
    w.addSpacer();
    const cls = w.addText(e.class.toUpperCase());
    cls.font = Font.boldSystemFont(9);
    cls.textColor = new Color(colorFor(e.class));
    const title = w.addText(e.title);
    title.font = Font.semiboldSystemFont(13);
    title.textColor = TEXT;
    title.lineLimit = 2;
    return w;
  }

  const count = family === "large" ? 5 : 2;
  for (const e of eps.slice(0, count)) {
    const row = w.addStack();
    row.centerAlignContent();
    row.url = link(e);
    addArt(row, await loadArt(e), e, 42);
    row.addSpacer(10);

    const col = row.addStack();
    col.layoutVertically();
    const cls = col.addText(e.class.toUpperCase());
    cls.font = Font.boldSystemFont(9);
    cls.textColor = new Color(colorFor(e.class));
    const title = col.addText(e.title);
    title.font = Font.semiboldSystemFont(13);
    title.textColor = TEXT;
    title.lineLimit = 1;
    const meta = col.addText(`${niceDate(e.date)} · ${mins(e.duration_seconds)}`);
    meta.font = Font.systemFont(11);
    meta.textColor = MUTED;
    row.addSpacer();
    w.addSpacer(8);
  }
  w.addSpacer();
  return w;
}

/* ---------- in-app list ---------- */

async function showTable(eps) {
  const table = new UITable();
  table.showSeparators = true;

  const top = new UITableRow();
  top.isHeader = true;
  top.height = 60;
  const h = top.addText("Study Pods", `${eps.length} episodes · tap to play`);
  h.titleFont = Font.heavySystemFont(24);
  h.subtitleColor = Color.gray();
  table.addRow(top);

  for (const cls of [...new Set(eps.map((e) => e.class))]) {
    const head = new UITableRow();
    head.isHeader = true;
    const t = head.addText(cls);
    t.titleColor = new Color(colorFor(cls));
    t.titleFont = Font.boldSystemFont(15);
    table.addRow(head);

    for (const e of eps.filter((x) => x.class === cls)) {
      const row = new UITableRow();
      row.height = 64;
      row.dismissOnSelect = false;
      const c = row.addText(e.title, `${niceDate(e.date)} · ${mins(e.duration_seconds)}`);
      c.titleFont = Font.semiboldSystemFont(15);
      c.subtitleColor = Color.gray();
      row.onSelect = () => Safari.open(link(e));
      table.addRow(row);
    }
  }

  const preview = new UITableRow();
  preview.dismissOnSelect = false;
  preview.addText("Preview widget").titleColor = AMBER;
  preview.onSelect = async () => (await buildWidget(eps)).presentMedium();
  table.addRow(preview);

  await table.present();
}

/* ---------- run ---------- */

const episodes = await loadEpisodes();
if (config.runsInWidget) {
  Script.setWidget(await buildWidget(episodes));
} else {
  await showTable(episodes);
}
Script.complete();
