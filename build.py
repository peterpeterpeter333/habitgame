from pathlib import Path
import shutil
root = Path(__file__).resolve().parent
docs = root / 'docs'
docs.mkdir(exist_ok=True)
shutil.copytree(root / 'assets', docs / 'assets', dirs_exist_ok=True)
for file in ['style.css', 'engine.js', 'art.js', 'app.js']:
    shutil.copy2(root / 'src' / file, docs / file)
html = (root / 'src/shell.html').read_text()
html = html.replace('<style>/*STYLE*/</style>', '<link rel="stylesheet" href="style.css">')
scripts = '<script>const ASSETS={forest:"assets/forest-guardian.png",volcano:"assets/volcano-guardian.png",glacier:"assets/glacier-guardian.png"};</script>'
scripts += ''.join('<script src="' + name + '"></script>' for name in ['engine.js', 'art.js', 'app.js'])
html = html.replace('<script>/*CODE*/</script>', scripts)
(docs / 'index.html').write_text(html)
(docs / '.nojekyll').touch()
print('Built GitHub Pages site in docs/')
