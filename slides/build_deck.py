#!/usr/bin/env python3
"""Build slides/deck.html: a standalone viewer for the Team 5 Sprint 1 review deck.

The slide sources in slides/source/ are the exact files published to the Claude Slides
artifact (https://claude.ai/artifact/2j4kV7aS3imXixjQnFbwFv). Images there are referenced as
/_blob/<id>; this script swaps them for the PNGs in slides/images/ and adds small stand-ins
for the <x-icon> and <x-connector> elements so the deck renders in any browser.
Usage: python3 slides/build_deck.py   (then open slides/deck.html; Print -> PDF for a PDF)
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'source'
BLOBS = {
    'ed9eee5499231f811d07befbb80bdbfb': 'matches-top.png',
    'f5100dfe55705a753d52d59eebcdcf17': 'drawer.png',
    '56e0412d4294f0cffde408c4b2e4910b': 'review.png',
    '2460437813b7877bb4c5cbb8aa347c66': 'changed.png',
    '67378de286533f18688b858e98b56fe0': 'question.png',
    '2722c97b78076a4cb6b7c17c6366eead': 'tour.png',
    '7c3ce153a1d1daa9dde0e13eeddb42d8': 'matrix.png',
}

deck = json.loads((SRC / 'deck.json').read_text())
frames = []
for i, sid in enumerate(deck['order'], 1):
    html = (SRC / 'slides' / f'{sid}.html').read_text()
    html = re.sub(r'/_blob/([0-9a-f]{32})', lambda m: 'images/' + BLOBS[m.group(1)], html)
    m = re.search(r'<aside>(.*?)</aside>', html, re.S)
    notes = m.group(1).strip() if m else ''
    frames.append(f'<div class="frame" id="s{i}">{html}</div>\n<p class="notes"><b>{i}. {sid}</b> {notes}</p>')

fonts = '&'.join('family=' + f['href'].split('family=')[1].split('&')[0] for f in deck['faces'].values())
page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{deck['title']}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{fonts}&display=swap">
<style>
body{{margin:0;background:#2E3328;font-family:Figtree,Arial,sans-serif}}
.deck{{display:flex;flex-direction:column;align-items:center;gap:20px;padding:32px 16px}}
.frame{{width:min(100%,1280px);aspect-ratio:16/9;position:relative;overflow:hidden;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.35)}}
.frame>section{{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;box-sizing:border-box}}
.frame section *{{margin:0;box-sizing:border-box}}
.frame section ul{{padding-left:1.1em}}
.frame section img{{display:block}}
.frame section aside{{display:none}}
x-icon{{display:inline-block}} x-icon svg{{width:100%;height:100%;display:block}}
x-connector{{display:inline-block;height:24px;flex:none;border-style:none}}
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
const ICONS = {{
  Check: '<path d="M20 6 9 17l-5-5"/>',
  CheckCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  Users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  Chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'
}};
customElements.define('x-icon', class extends HTMLElement {{
  connectedCallback() {{
    this.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[this.getAttribute('name')] || '') + '</svg>';
  }}
}});
customElements.define('x-connector', class extends HTMLElement {{
  connectedCallback() {{
    const w = parseFloat(this.style.width) || 48, sw = parseFloat(this.style.borderWidth) || 2;
    this.innerHTML = `<svg width="${{w}}" height="24" viewBox="0 0 ${{w}} 24" fill="none" stroke="currentColor" stroke-width="${{sw}}" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12H${{w - 3}}M${{w - 11}} 4l8 8-8 8"/></svg>`;
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
(HERE / 'deck.html').write_text(page)
print('wrote', HERE / 'deck.html', len(deck['order']), 'slides')
