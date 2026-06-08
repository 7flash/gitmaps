import json
import sys
import urllib.request

path = sys.argv[1]
headers = {'Content-Type': 'application/json'}

load_req = urllib.request.Request(
    'http://localhost:3335/api/repo/load',
    data=json.dumps({'path': path}).encode(),
    headers=headers,
)
tree_req = urllib.request.Request(
    'http://localhost:3335/api/repo/tree',
    data=json.dumps({'path': path}).encode(),
    headers=headers,
)

with urllib.request.urlopen(load_req, timeout=180) as r:
    load_data = json.loads(r.read().decode())
with urllib.request.urlopen(tree_req, timeout=300) as r:
    tree_data = json.loads(r.read().decode())

slug = load_data.get('canonicalSlug') or path.replace('\\', '/').rstrip('/').split('/')[-1]

print(json.dumps({
    'path': path,
    'slug': slug,
    'commitCount': len(load_data.get('commits', [])),
    'fileCount': len(tree_data.get('files', [])),
}))