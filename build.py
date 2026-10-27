from pathlib import Path
import shutil,hashlib,json,struct
root=Path(__file__).resolve().parent;docs=root/'docs';docs.mkdir(exist_ok=True)
shutil.copytree(root/'assets',docs/'assets',dirs_exist_ok=True)
styles=['style.css','fantasy.css','divine-frame.css','combat-fx.css']
files=['catalog.js','engine.js','art.js','sound.js','app.js']
for name in styles:shutil.copy2(root/'src'/name,docs/name)
for name in files:shutil.copy2(root/'src'/name,docs/name)
revision=lambda name:hashlib.sha256((docs/name).read_bytes()).hexdigest()[:12]
sheets={}
for path in (root/'assets').glob('*.png'):
    w,h=struct.unpack('>II',path.read_bytes()[16:24]);sheets[path.name]={'url':'assets/'+path.name,'width':w,'height':h}
assets={'collection0':'assets/collection-a-alpha.png','collection1':'assets/collection-b-alpha.png','sheets':sheets}
html=(root/'src/shell.html').read_text().replace('<style>/*STYLE*/</style>',''.join('<link rel="stylesheet" href="'+name+'?v='+revision(name)+'">' for name in styles))
scripts='<script>const ASSETS='+json.dumps(assets)+';</script>'+''.join('<script src="'+name+'?v='+revision(name)+'"></script>' for name in files)
html=html.replace('<script>/*CODE*/</script>',scripts);(docs/'index.html').write_text(html);(docs/'.nojekyll').touch()
if (root/'research.html').exists():shutil.copy2(root/'research.html',docs/'research.html')
print('Built QUEST FORGE IV')
