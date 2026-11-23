"""Refresh the LuCI category index from the existing MetaCubeX source."""
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen


def read_tree(ref):
    url = f"https://api.github.com/repos/MetaCubeX/meta-rules-dat/git/trees/{ref}"
    with urlopen(Request(url, headers={"User-Agent": "RouteWolf"}), timeout=20) as response:
        tree = json.load(response)
    if tree["truncated"]:
        raise RuntimeError(f"Incomplete MetaCubeX index for {ref}")
    return tree


def subtree(tree, name):
    return next(item["sha"] for item in tree["tree"] if item["path"] == name and item["type"] == "tree")


if __name__ == "__main__":
    upstream = read_tree("sing")
    geo = read_tree(subtree(upstream, "geo"))
    catalog = {}
    for kind in ("geosite", "geoip"):
        entries = read_tree(subtree(geo, kind))["tree"]
        catalog[kind] = sorted(item["path"][:-5] for item in entries if item["type"] == "blob"
                               and 0 < item["size"] <= 131072
                               and re.fullmatch(r"[a-z0-9_][a-z0-9_@.-]{0,63}\.json", item["path"]))
        if not catalog[kind]:
            raise RuntimeError(f"No categories found for {kind}")
    path = Path(__file__).resolve().parents[1] / "luci-app-routewolf/htdocs/luci-static/resources/view/routewolf/geo-catalog.js"
    data = json.dumps(catalog, separators=(",", ":"))
    path.write_text(f"'use strict';\n// MetaCubeX/meta-rules-dat sing: {upstream['sha']}\nreturn {data};\n",
                    encoding="utf-8", newline="\n")
    print(", ".join(f"{kind}: {len(names)}" for kind, names in catalog.items()), path.stat().st_size, "bytes")
