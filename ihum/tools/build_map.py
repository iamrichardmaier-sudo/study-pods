"""Build ihum/map-data.js: projected, simplified SVG paths for the North Africa / Middle East map game.

Source: Natural Earth via github.com/datasets/geo-countries (public domain).
Usage: python3 build_map.py countries.geojson ../map-data.js
"""
import json, math, sys

SRC, OUT = sys.argv[1], sys.argv[2]

LON0, LON1, LAT0, LAT1 = -19.0, 81.0, 6.0, 46.0
W = 1000.0
PAD = 1.5  # degrees of clipping slack around the view

def merc(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

Y_TOP, Y_BOT = merc(LAT1), merc(LAT0)
K = W / math.radians(LON1 - LON0)
H = (Y_TOP - Y_BOT) * K

def proj(lon, lat):
    return ((math.radians(lon - LON0)) * K, (Y_TOP - merc(lat)) * K)

# Map source names to the id we use. Everything else keeps its ISO3.
MERGE = {
    "Northern Cyprus": "CYP", "Cyprus No Mans Area": "CYP",
    "Akrotiri Sovereign Base Area": "CYP", "Dhekelia Sovereign Base Area": "CYP",
    "Somaliland": "SOM", "Baykonur Cosmodrome": "KAZ", "Siachen Glacier": "IND",
}

def clip(ring, x0, y0, x1, y1):
    """Sutherland-Hodgman against an axis-aligned rect (lon/lat space)."""
    def cut(pts, inside, inter):
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
        return out
    def ix(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))
    def iy(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)
    pts = ring
    for inside, inter in (
        (lambda p: p[0] >= x0, ix(x0)), (lambda p: p[0] <= x1, ix(x1)),
        (lambda p: p[1] >= y0, iy(y0)), (lambda p: p[1] <= y1, iy(y1)),
    ):
        if not pts:
            break
        pts = cut(pts, inside, inter)
    return pts

def dp(pts, eps):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if d > best:
                best, bi = d, i
        if best > eps:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def area(pts):
    return abs(sum(pts[i - 1][0] * p[1] - p[0] * pts[i - 1][1] for i, p in enumerate(pts))) / 2

data = json.load(open(SRC))
shapes = {}  # id -> list of projected rings
for f in data["features"]:
    p = f["properties"]
    cid = MERGE.get(p["name"]) or p["ISO3166-1-Alpha-3"]
    if cid == "-99":
        cid = p["name"].upper().replace(" ", "_")[:12]
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    for poly in polys:
        for ri, ring in enumerate(poly):
            if ri > 0:
                continue  # ignore holes (enclaves are drawn as their own country on top)
            c = clip([tuple(pt) for pt in ring], LON0 - PAD, LAT0 - PAD, LON1 + PAD, LAT1 + PAD)
            if len(c) < 3:
                continue
            pr = [proj(*pt) for pt in c]
            shapes.setdefault(cid, []).append(pr)

out = {}
for cid, rings in shapes.items():
    rings.sort(key=area, reverse=True)
    parts = []
    for i, r in enumerate(rings):
        if i > 0 and area(r) < 4:
            continue
        far = max(range(len(r)), key=lambda j: (r[j][0] - r[0][0]) ** 2 + (r[j][1] - r[0][1]) ** 2)
        s = dp(r[: far + 1], 0.45)[:-1] + dp(r[far:] + [r[0]], 0.45)
        if len(s) < 4:
            if i == 0:
                s = r + [r[0]]
            else:
                continue
        parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in s[:-1]) + "Z")
    if parts:
        out[cid] = "".join(parts)

js = "// Generated from Natural Earth (public domain). Mercator, viewBox 0 0 %d %d.\n" % (W, round(H))
js += "window.MAP_DATA = " + json.dumps({"w": W, "h": round(H), "paths": out}, separators=(",", ":")) + ";\n"
open(OUT, "w").write(js)
print(len(out), "shapes,", len(js) // 1024, "KB, h =", round(H))
