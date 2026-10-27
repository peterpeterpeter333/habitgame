from pathlib import Path
import shutil,hashlib,json,struct
root=Path(__file__).resolve().parent;docs=root/'docs';docs.mkdir(exist_ok=True)
shutil.copytree(root/'assets',docs/'assets',dirs_exist_ok=True)
files=['style.css','catalog.js','engine.js','art.js','sound.js','app.js']
shutil.copy2(root/'src/fantasy.css',docs/'fantasy.css')
for name in files:shutil.copy2(root/'src'/name,docs/name)
revision=lambda name:hashlib.sha256((docs/name).read_bytes()).hexdigest()[:12]
sheets={}
for path in (root/'assets').glob('*.png'):
    w,h=struct.unpack('>II',path.read_bytes()[16:24]);sheets[path.name]={'url':'assets/'+path.name,'width':w,'height':h}
assets={'collection0':'assets/collection-a-alpha.png','collection1':'assets/collection-b-alpha.png','sheets':sheets}
html=(root/'src/shell.html').read_text().replace('<style>/*STYLE*/</style>','<link rel="stylesheet" href="style.css?v='+revision('style.css')+'"><link rel="stylesheet" href="fantasy.css?v='+revision('fantasy.css')+'">')
scripts='<script>const ASSETS='+json.dumps(assets)+';</script>'+''.join('<script src="'+name+'?v='+revision(name)+'"></script>' for name in files[1:])
html=html.replace('<script>/*CODE*/</script>',scripts);(docs/'index.html').write_text(html);(docs/'.nojekyll').touch()
if (root/'research.html').exists():shutil.copy2(root/'research.html',docs/'research.html')
print('Built QUEST FORGE IV')
