"""Build the GitHub Pages version of the app (web/) from Index.html.

The page is the same app; only the server calls change: instead of google.script.run
it POSTs {fn, args} to the Apps Script /exec URL (doPost in Code.gs), without cookies.
Usage: python3 build_web.py [API_URL]
"""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
API_URL = sys.argv[1] if len(sys.argv) > 1 else 'https://script.google.com/macros/s/AKfycbwFr9beoSX7Lu8hQJo-8j0WR9d7qTcctEkPTUdVPD0rOYlI89Iao8thNy1CFPTgQ3dH/exec'
APP_NAME = 'Shashvi MR App'
OUT = os.path.join(HERE, 'web')
os.makedirs(OUT, exist_ok=True)

src = open(os.path.join(HERE, 'Index.html'), encoding='utf-8').read()

def swap(old, new):
    global src
    assert src.count(old) == 1, old[:60]
    src = src.replace(old, new)

swap('<base target="_top">\n<meta charset="utf-8">',
     '<meta charset="utf-8">\n'
     '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">\n'
     f'<title>{APP_NAME}</title>\n'
     '<meta name="theme-color" content="#0B2545">\n'
     '<link rel="manifest" href="manifest.json">\n'
     '<link rel="icon" href="icon-192.png">\n'
     '<link rel="apple-touch-icon" href="icon-192.png">\n'
     '<meta name="robots" content="noindex">')

swap('var KEY_FROM_URL = <?!= JSON.stringify(key) ?>;',
     "var KEY_FROM_URL = (function(){ try{ return (new URLSearchParams(location.search).get('k')||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,64); }catch(e){ return ''; } })();\n"
     f"var API_URL = {json.dumps(API_URL)};")
swap('var APP_NAME = <?!= JSON.stringify(appName) ?>;', f'var APP_NAME = {json.dumps(APP_NAME)};')

swap("""  google.script.run.withSuccessHandler(res).withFailureHandler(function(e){ rej(e); })[fn].apply(null, [KEY].concat(args)); }); }""",
     """  var body=JSON.stringify({fn:fn, args:[KEY].concat(args)}), tries=0;
  (function go(){ tries++;
    fetch(API_URL, {method:'POST', body:body, headers:{'Content-Type':'text/plain;charset=utf-8'}, credentials:'omit', redirect:'follow'})
      .then(function(r){ return r.text(); })
      .then(function(t){ var j; try{ j=JSON.parse(t); }catch(e){ throw new Error('Server se sahi jawab nahi aaya. Thodi der baad try karein.'); }
        if(j.ok) res(j.data); else rej(new Error(j.error||'Error')); })
      .catch(function(e){ if(tries<2 && /fetch|network|Failed/i.test(String(e&&e.message))) return setTimeout(go, 1200);
        rej(/fetch|network|Failed/i.test(String(e&&e.message))?new Error('Server tak nahi pahunch paaye. Net check karke dobara try karein. ('+String(e&&e.message)+')'):e); });
  })(); }); }""")

# keep the key out of the address bar once saved, so screenshots / shares don't leak it
swap("if (KEY_FROM_URL) store('mrkey', KEY_FROM_URL);",
     "if (KEY_FROM_URL) { store('mrkey', KEY_FROM_URL); try{ history.replaceState(null, '', location.pathname); }catch(e){} }")

open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(src)

json.dump({
    'name': APP_NAME, 'short_name': 'Shashvi MR', 'start_url': './', 'scope': './',
    'display': 'standalone', 'background_color': '#F3F5F9', 'theme_color': '#0B2545',
    'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
              {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'}]
}, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=2)

logo = Image.open(os.path.join(HERE, 'shashvi-logo.png')).convert('RGBA')
for n in (192, 512):
    bg = Image.new('RGBA', (n, n), 'white')
    s = int(n * 0.86); im = logo.copy(); im.thumbnail((s, s), Image.LANCZOS)
    bg.paste(im, ((n - im.width) // 2, (n - im.height) // 2), im)
    bg.convert('RGB').save(os.path.join(OUT, f'icon-{n}.png'))
print('built', OUT)
