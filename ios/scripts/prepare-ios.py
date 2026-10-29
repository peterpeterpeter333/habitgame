"""Bundle the current game into the iPhone app without downloading code at runtime."""
from pathlib import Path
import shutil,subprocess,hashlib,json
root=Path(__file__).resolve().parents[2]
subprocess.run(['python3',str(root/'build.py')],cwd=root,check=True)
out=root/'ios/QuestForgeApp/Web'
if out.exists():shutil.rmtree(out)
out.mkdir(parents=True)
for path in (root/'docs').iterdir():
    if path.name.startswith('qa-') or path.name in ['.nojekyll','research.html']:continue
    if path.is_dir():shutil.copytree(path,out/path.name)
    else:shutil.copy2(path,out/path.name)
manifest={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in out.rglob('*') if p.is_file()}
(root/'ios/web-assets-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Bundled',len(manifest),'offline files')
