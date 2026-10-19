#!/usr/bin/env python3
"""Converte o catálogo HYG em chunks binários organizados numa octree.

Saída (em public/universe/v1/):
  manifest.json  índice da octree (um nó por chunk)
  names.json     nomes próprios das estrelas que têm nome
  n/<id>.bin     estrelas de cada nó, Float32 intercalado:
                 x, y, z (parsecs, relativos ao centro do nó), absmag, ci, id_hyg

Coordenadas: galácticas cartesianas em parsecs, com o Sol na origem
(x aponta para o centro galáctico, z para o polo norte galáctico).

LOD: cada nó guarda as estrelas mais brilhantes (menor magnitude absoluta)
que não couberam nos ancestrais. Ao se afastar, só os nós rasos ficam
carregados, então só as estrelas brilhantes aparecem.

Só usa a biblioteca padrão do Python.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import struct
import urllib.request
from pathlib import Path

HYG_URL = "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv"
ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / ".cache"
OUT = ROOT / "public" / "universe" / "v1"

NODE_CAPACITY = 4096  # estrelas guardadas em cada nó antes de passar para os filhos
MAX_DEPTH = 8
UNKNOWN_DIST = 100000.0  # o HYG usa 100000 pc para "paralaxe desconhecida"

# Matriz de rotação equatorial (J2000) -> galáctica.
EQ_TO_GAL = (
    (-0.0548755604, -0.8734370902, -0.4838350155),
    (0.4941094279, -0.4448296300, 0.7469822445),
    (-0.8676661490, -0.1980763734, 0.4559837762),
)


def download(url: str, dest: Path) -> Path:
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"baixando {url}")
        urllib.request.urlretrieve(url, dest)
    return dest


def to_galactic(x: float, y: float, z: float) -> tuple[float, float, float]:
    m = EQ_TO_GAL
    return (
        m[0][0] * x + m[0][1] * y + m[0][2] * z,
        m[1][0] * x + m[1][1] * y + m[1][2] * z,
        m[2][0] * x + m[2][1] * y + m[2][2] * z,
    )


def load_stars(csv_path: Path) -> tuple[list[tuple], dict[int, str]]:
    stars: list[tuple] = []
    names: dict[int, str] = {}
    with csv_path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            dist = float(row["dist"] or UNKNOWN_DIST)
            if dist >= UNKNOWN_DIST:
                continue
            sid = int(row["id"])
            gx, gy, gz = to_galactic(float(row["x"]), float(row["y"]), float(row["z"]))
            absmag = float(row["absmag"] or 5.0)
            ci = float(row["ci"]) if row["ci"] else 0.65
            stars.append((gx, gy, gz, absmag, ci, sid))
            if row["proper"]:
                names[sid] = row["proper"]
    return stars, names


class Node:
    def __init__(self, nid: str, center: tuple[float, float, float], half: float, depth: int):
        self.id = nid
        self.center = center
        self.half = half
        self.depth = depth
        self.stars: list[tuple] = []
        self.children: list[Node] = []


def build(node: Node, stars: list[tuple]) -> None:
    stars.sort(key=lambda s: s[3])
    node.stars = stars[:NODE_CAPACITY]
    rest = stars[NODE_CAPACITY:]
    if not rest:
        return
    if node.depth >= MAX_DEPTH:
        node.stars = stars
        return
    buckets: dict[int, list[tuple]] = {}
    cx, cy, cz = node.center
    for s in rest:
        octant = (s[0] >= cx) | ((s[1] >= cy) << 1) | ((s[2] >= cz) << 2)
        buckets.setdefault(octant, []).append(s)
    h = node.half / 2
    for octant, bucket in sorted(buckets.items()):
        center = (
            cx + (h if octant & 1 else -h),
            cy + (h if octant & 2 else -h),
            cz + (h if octant & 4 else -h),
        )
        child = Node(node.id + str(octant), center, h, node.depth + 1)
        node.children.append(child)
        build(child, bucket)


def write(node: Node, out: list[dict], max_abs: list[float]) -> None:
    cx, cy, cz = node.center
    buf = bytearray()
    for x, y, z, absmag, ci, sid in node.stars:
        buf += struct.pack("<6f", x - cx, y - cy, z - cz, absmag, ci, float(sid))
    (OUT / "n" / f"{node.id}.bin").write_bytes(bytes(buf))
    brightest = min((s[3] for s in node.stars), default=99.0)
    out.append(
        {
            "id": node.id,
            "c": [round(v, 4) for v in node.center],
            "h": round(node.half, 4),
            "n": len(node.stars),
            "b": round(brightest, 2),
            "k": [c.id for c in node.children],
        }
    )
    max_abs[0] = max(max_abs[0], max((abs(v) for v in node.center), default=0.0))
    for c in node.children:
        write(c, out, max_abs)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--csv", type=Path, help="CSV do HYG já baixado (opcional)")
    args = ap.parse_args()

    csv_path = args.csv or download(HYG_URL, CACHE / "hygdata_v41.csv")
    stars, names = load_stars(csv_path)
    extent = max(max(abs(s[0]), abs(s[1]), abs(s[2])) for s in stars)
    half = 2 ** math.ceil(math.log2(extent + 1))

    root = Node("r", (0.0, 0.0, 0.0), half, 0)
    build(root, stars)

    (OUT / "n").mkdir(parents=True, exist_ok=True)
    for old in (OUT / "n").glob("*.bin"):
        old.unlink()
    nodes: list[dict] = []
    write(root, nodes, [0.0])

    manifest = {
        "version": 1,
        "source": "HYG Database v4.1 (CC BY-SA 4.0), astronexus/HYG-Database",
        "units": "parsec, coordenadas galácticas cartesianas, Sol na origem",
        "stride": 6,
        "stars": len(stars),
        "nodes": nodes,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    (OUT / "names.json").write_text(
        json.dumps({str(k): v for k, v in sorted(names.items())}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"{len(stars)} estrelas em {len(nodes)} chunks, meia-aresta da raiz {half} pc, {len(names)} nomes")


if __name__ == "__main__":
    main()
