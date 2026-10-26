"""Build a portable HTML. An output path may be passed as the first argument."""
from pathlib import Path
import base64,json,struct,sys
root=Path(__file__).resolve().parent;out=Path(sys.argv[1]) if len(sys.argv)>1 else root/'quest-forge.html'
def data(name):return 'data:image/png;base64,'+base64.b64encode((root/'assets'/name).read_bytes()).decode()
names=['common-'+str(i)+'.png' for i in range(3)]+['elite-'+str(i)+'.png' for i in range(2)]+['rare-'+str(i)+'.png' for i in range(2)]+['companions.png']
sheets={}
for name in names:
    w,h=struct.unpack('>II',(root/'assets'/name).read_bytes()[16:24]);sheets[name]={'url':data(name),'width':w,'height':h}
assets={'collection0':data('collection-a-alpha.png'),'collection1':data('collection-b-alpha.png'),'sheets':sheets}
css=(root/'src/style.css').read_text().replace("url('assets/world-rooms.png')",'url("'+data('world-rooms.png')+'")')
# Old background rules are overridden; remove their unused remote references too.
css=css.replace("url('assets/dungeon-backgrounds.png')",'none')
code='const ASSETS='+json.dumps(assets)+';\n'+'\n'.join((root/'src'/name).read_text() for name in ['catalog.js','engine.js','art.js','sound.js','app.js'])
html=(root/'src/shell.html').read_text().replace('<style>/*STYLE*/</style>','<style>'+css+'</style>').replace('<script>/*CODE*/</script>','<script>'+code+'</script>')
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(html);print('Built',out.name)
