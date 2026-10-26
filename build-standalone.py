"""Build a portable, offline HTML; optional output path is the first argument."""
from pathlib import Path
import base64, json, sys
root = Path(__file__).resolve().parent
out = Path(sys.argv[1]) if len(sys.argv)>1 else root/'quest-forge.html'
def data(name):
    return 'data:image/png;base64,'+base64.b64encode((root/'assets'/name).read_bytes()).decode()
assets={'collection0':data('collection-a-alpha.png'),'collection1':data('collection-b-alpha.png'),'backgrounds':data('dungeon-backgrounds.png')}
css=(root/'src/style.css').read_text().replace("url('assets/dungeon-backgrounds.png')",'url("'+assets['backgrounds']+'")')
code='const ASSETS='+json.dumps(assets)+';\n'+'\n'.join((root/'src'/name).read_text() for name in ['catalog.js','engine.js','art.js','sound.js','app.js'])
html=(root/'src/shell.html').read_text().replace('<style>/*STYLE*/</style>','<style>'+css+'</style>').replace('<script>/*CODE*/</script>','<script>'+code+'</script>')
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(html)
print('Built',out.name)
