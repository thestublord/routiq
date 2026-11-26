"""Compile city trail and shared-use path lines and public GPX point samples.

Input files are the unmodified GIS/OSM downloads. Only aggregated heat cells
and public path geometries are included in the shipped planner.
"""
import argparse
import collections
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("input", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--date", required=True)
args = parser.parse_args()


def coordinate(lon, lat):
    return round(lat * 100000), round(lon * 100000)


lines = []
for feature in json.loads((args.input / "routiq-preserve.json").read_text())["features"]:
    props, geo = feature["properties"], feature["geometry"]
    if props["feature_state"] != "ACTIVE":
        continue
    access = {"MULTI-USE": 3, "HIKING TRAIL": 1, "CYCLE ROUTE": 2}.get(props["trail_type"])
    for part in ([geo["coordinates"]] if geo["type"] == "LineString" else geo["coordinates"]):
        if access:
            lines.append((props["name"], access, [coordinate(*p[:2]) for p in part]))

for feature in json.loads((args.input / "routiq-sharedpaths.json").read_text()):
    for part in feature["geometry"]["paths"]:
        name = feature["attributes"].get("name") or "Shared use path"
        lines.append((name, 3, [coordinate(*p[:2]) for p in part]))

# The city layers are cartographic lines. A branch can end between two vertices
# of the through-trail. Split that segment at the junction before simplifying.
segments = collections.defaultdict(list)
for li, (_, _, points) in enumerate(lines):
    for j, (a, b) in enumerate(zip(points, points[1:])):
        for y in range(min(a[0], b[0])//60, max(a[0], b[0])//60+1):
            for x in range(min(a[1], b[1])//60, max(a[1], b[1])//60+1):
                segments[y, x].append((li, j))
inserts = collections.defaultdict(set)
for li, (_, _, points) in enumerate(lines):
    for p in [points[0], points[-1]]:
        best = None
        for y in range((p[0]-5)//60, (p[0]+5)//60+1):
            for x in range((p[1]-6)//60, (p[1]+6)//60+1):
                for other, j in segments[y, x]:
                    if other == li:
                        continue
                    a, b = lines[other][2][j:j+2]
                    dy, dx = (b[0]-a[0])*1.11, (b[1]-a[1])*.927
                    py, px = (p[0]-a[0])*1.11, (p[1]-a[1])*.927
                    t = max(0, min(1, (py*dy+px*dx)/(dy*dy+dx*dx or 1)))
                    d = math.hypot(py-t*dy, px-t*dx)
                    if d <= 5 and (best is None or d < best[0]):
                        best = (d, other, j, t)
        if best:
            _, other, j, t = best
            inserts[other, j].add((t, p))
for li, (name, access, points) in enumerate(lines):
    split = []
    for j, p in enumerate(points[:-1]):
        split.append(p)
        split.extend(q for _, q in sorted(inserts.get((li, j), [])) if q != p and q != points[j+1])
    lines[li] = name, access, split + [points[-1]]

# Preserve shared geometry vertices so branches stay connected after simplification.
shared = collections.Counter()
for _, _, points in lines:
    shared.update(set(points))
vertices, vertex_ids, paths = [], {}, []
for name, access, points in lines:
    line = []
    last = None
    for i, point in enumerate(points):
        key = point
        if last and i < len(points)-1 and shared[key] == 1:
            if math.hypot((point[0]-last[0])*1.11, (point[1]-last[1])*.927) < 9:
                continue
        if key not in vertex_ids:
            vertex_ids[key] = len(vertices)
            vertices.append(point)
        vid = vertex_ids[key]
        if not line or line[-1] != vid:
            line.append(vid)
        last = point
    if len(line) > 1:
        paths.append([name, access, line])

cells = collections.Counter()
seen = set()
for gpx in sorted(args.input.glob("routiq-az-*.gpx")):
    for pt in ET.parse(gpx).iterfind(".//{*}trkpt"):
        lat, lon = float(pt.get("lat")), float(pt.get("lon"))
        key = (lat, lon, pt.findtext("{*}time"))
        if key in seen:
            continue
        seen.add(key)
        cells[(math.floor(lat*1000), math.floor(lon*1000))] += 1
result = {"date": args.date, "vertices": vertices, "paths": paths,
          "heat": [[y, x, count] for (y, x), count in sorted(cells.items())],
          "samples": sum(cells.values())}
args.output.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
print(len(vertices), "vertices,", len(paths), "lines,", result["samples"], "sample points")
