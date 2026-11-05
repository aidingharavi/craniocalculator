#!/usr/bin/env python3
"""Assemble the static pages.

Each file in src/pages is an HTML fragment whose first line is a JSON
comment with page settings, e.g.

  <!--{"title": "Trials", "description": "...", "nav": "trials", "scripts": ["trials.js"]}-->

Run `python3 build.py` after editing anything in src/. Output goes to public/,
which is what Cloudflare Pages serves. Generated pages are committed so the
host needs no build step.
"""
import json
import pathlib
import re
import time

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "public"

NAV = [
    ("calculators", "/calculators/", "Calculators"),
    ("research", "/research", "New craniofacial research"),
    ("collaboration", "/collaboration", "Collaboration"),
    ("about", "/about", "About"),
]

SITE = "craniocalc"


def build():
    layout = (SRC / "layout.html").read_text()
    partials = {p.stem: p.read_text().strip() for p in (SRC / "partials").glob("*.html")}
    version = time.strftime("%Y%m%d%H%M")
    pages = sorted((SRC / "pages").rglob("*.html"))
    for page in pages:
        text = page.read_text()
        m = re.match(r"\s*<!--(\{.*?\})-->\s*", text, re.S)
        if not m:
            raise SystemExit(f"{page}: missing JSON settings comment on the first line")
        meta = json.loads(m.group(1))
        body = text[m.end():]
        for name, html in partials.items():
            body = body.replace("{{> " + name + "}}", html)

        rel = page.relative_to(SRC / "pages")
        parts = list(rel.with_suffix("").parts)
        if parts[-1] == "index":
            parts = parts[:-1]
        path = "/" + "/".join(parts)
        if rel.stem == "index" and len(parts) > 0:
            path += "/"  # directory index, served with a trailing slash

        nav = "\n".join(
            f'        <li><a href="{href}"{" aria-current=\"page\"" if meta.get("nav") == key else ""}>{label}</a></li>'
            for key, href, label in NAV
        )
        scripts = "\n".join(
            f'<script src="/assets/js/{s}?v={version}" defer></script>' for s in meta.get("scripts", [])
        )
        title = meta["title"] if meta.get("bareTitle") else f'{meta["title"]} | {SITE}'
        html = (
            layout.replace("{{title}}", esc(title))
            .replace("{{description}}", esc(meta.get("description", "")))
            .replace("{{path}}", path)
            .replace("{{nav}}", nav)
            .replace("{{scripts}}", scripts)
            .replace("{{version}}", version)
            .replace("{{content}}", body.strip())
        )
        dest = OUT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(html)
        print(f"built {dest.relative_to(ROOT)}")


def esc(s):
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


if __name__ == "__main__":
    build()
