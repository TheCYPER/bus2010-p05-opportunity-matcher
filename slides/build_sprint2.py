#!/usr/bin/env python3
"""Build slides/sprint2/deck.html: a standalone viewer for the Team 5 Sprint 2 review deck.

The sources in slides/sprint2/project/ are the files published to the Claude Slides artifact
(https://claude.ai/artifact/5jopVHmpwd4nz3LJLT61zw). Images there are /_blob/<id>; this script
swaps them for the PNGs in slides/images2/, links deck.css, and adds small stand-ins for <x-icon>
so the deck renders in any browser. Speaker notes are printed under each slide.
Usage: python3 slides/build_sprint2.py   (open slides/sprint2/deck.html; Print -> PDF, margins none)
"""
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'sprint2' / 'project'
BLOBS = {
    'bccbe1fad643785e9b5d887702bd7ac9': '../images2/top3-ai.png',
    'f59fa597493ef191dd360492ff44c897': '../images2/ai-suggestions.png',
}

deck = json.loads((SRC / 'deck.json').read_text())
frames = []
for i, sid in enumerate(deck['order'], 1):
    html = (SRC / 'slides' / f'{sid}.html').read_text()
    html = re.sub(r'/_blob/([0-9a-f]{32})', lambda m: BLOBS[m.group(1)], html)
    m = re.search(r'<aside>(.*?)</aside>', html, re.S)
    notes = m.group(1).strip() if m else ''
    frames.append(f'<div class="frame" id="s{i}">{html}</div>\n<p class="notes"><b>{i}. {sid}</b> {notes}</p>')

fonts = '&'.join('family=' + f['href'].split('family=')[1].split('&')[0] for f in deck['faces'].values())
page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{deck['title']}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{fonts}&display=swap">
<link rel="stylesheet" href="project/deck.css">
<style>
body{{margin:0;background:#2E3328;font-family:Figtree,Arial,sans-serif}}
.deck{{display:flex;flex-direction:column;align-items:center;gap:20px;padding:32px 16px}}
.frame{{width:min(100%,1280px);aspect-ratio:16/9;position:relative;overflow:hidden;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.35)}}
.frame>section{{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;box-sizing:border-box;overflow:hidden}}
.frame section *{{margin:0}}
.frame section aside{{display:none}}
.frame section img{{display:block}}
.frame section table{{border-collapse:separate;border-spacing:0;border-top:2px solid #C5CEB5}}
.frame section th,.frame section td{{padding:.35em .6em;text-align:left;border-bottom:2px solid #DFE5D3}}
.frame section th{{font-weight:700}}
x-icon{{display:inline-block}} x-icon svg{{width:100%;height:100%;display:block}}
.notes{{width:min(100%,1280px);margin:0 0 28px;color:#D9DFCD;font-size:14px;line-height:1.55}}
.notes b{{color:#DCD964;margin-right:6px}}
@media print{{
  @page{{size:1920px 1080px;margin:0}}
  body{{background:#fff}} .deck{{padding:0;gap:0}} .notes{{display:none}}
  .frame{{width:1920px;height:1080px;aspect-ratio:auto;border-radius:0;box-shadow:none;break-after:page}}
  .frame>section{{transform:none!important}}
}}
</style></head><body>
<main class="deck">
{chr(10).join(frames)}
</main>
<script>
const ICONS = {{ Check: '<path d="M20 6 9 17l-5-5"/>' }};
customElements.define('x-icon', class extends HTMLElement {{
  connectedCallback() {{
    this.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[this.getAttribute('name')] || '') + '</svg>';
  }}
}});
function fit() {{
  document.querySelectorAll('.frame').forEach(f => {{
    const s = f.querySelector('section'); if (s) s.style.transform = 'scale(' + (f.clientWidth / 1920) + ')';
  }});
}}
addEventListener('resize', fit); fit();
</script>
</body></html>'''
(HERE / 'sprint2' / 'deck.html').write_text(page)
print('wrote', HERE / 'sprint2' / 'deck.html', len(deck['order']), 'slides')
