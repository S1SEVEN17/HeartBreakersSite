#!/usr/bin/env python3
"""
Content fingerprint of the built site (./site) + the gatekeeper (gate/) - used by banner.yml to skip the
Cloudflare upload when nothing a visitor would see has changed (Nov 2026).

Build-time stamps that change on every build are blanked before hashing, so a rebuild from the same data
gives the same fingerprint:
  "Page built <date> TCT" footers, "updated"/"generated_at" text stamps, "generated"/"built" times in db/*.json and manifests
Anything else that differs (new data, a timer drawn into an image, a code change) gives a new fingerprint
and the site is deployed.

Usage: site_hash.py [site_dir] [gate_dir]   -> prints the hex fingerprint (nothing else - public log)
       site_hash.py site gate --manifest F  -> also write {file: hash} to F (kept in the PRIVATE data repo next to
                                               the fingerprint - never printed, the paths hold the secret folders)
       site_hash.py --diff A B              -> local debugging: list files whose normalised content differs
"""
import hashlib
import re
import sys
from pathlib import Path

# build stamps only - these are rewritten on every build even when the data is identical
STAMPS = [
    (re.compile(rb"Page built [^<]{0,40}?TCT"), b"Page built -"),
    (re.compile(rb'"(updated|generated_at)":\s*"[^"]{0,40}"'), rb'"\1":"-"'),
    (re.compile(rb'"(generated|built)":\s*\d+'), rb'"\1":0'),
    (re.compile(rb'"built":\s*"[^"]{0,40}"'), b'"built":"-"'),
]
TEXT = {".html", ".json", ".js", ".css", ".txt", ".svg", ".toml", ".xml"}


def norm(p: Path) -> bytes:
    b = p.read_bytes()
    if p.suffix.lower() in TEXT:
        for rx, rep in STAMPS:
            b = rx.sub(rep, b)
    return b


def files(root: Path):
    skip = {"node_modules", ".wrangler"}
    return sorted(f for f in root.rglob("*") if f.is_file() and not (skip & set(f.relative_to(root).parts)))


def fingerprint(*roots: Path, manifest: dict = None) -> str:
    h = hashlib.sha256()
    for root in roots:
        if not root.exists():
            continue
        for f in files(root):
            d = hashlib.sha256(norm(f)).digest()
            h.update(str(f.relative_to(root)).encode() + b"\0")
            h.update(d)
            if manifest is not None:
                manifest[f"{root.name}/{f.relative_to(root)}"] = d.hex()[:16]
    return h.hexdigest()


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "--diff":
        A, B = Path(a[1]), Path(a[2])
        na = {f.relative_to(A): f for f in files(A)}
        nb = {f.relative_to(B): f for f in files(B)}
        for k in sorted(set(na) | set(nb)):
            if k not in na or k not in nb or norm(na[k]) != norm(nb[k]):
                print(k)
        sys.exit(0)
    man_path = None
    if "--manifest" in a:
        i = a.index("--manifest"); man_path = a[i + 1]; del a[i:i + 2]
    site = Path(a[0]) if a else Path("site")
    gate = Path(a[1]) if len(a) > 1 else Path("gate")
    man = {} if man_path else None
    print(fingerprint(site, gate, manifest=man))
    if man_path:
        import json
        Path(man_path).write_text(json.dumps(man, indent=0, sort_keys=True) + "\n")
