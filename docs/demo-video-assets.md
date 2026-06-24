# Demo video assets

This page explains how to regenerate the checked-in demo source assets and how an operator can turn them into a GIF or video with external tools. The repository keeps only source-based, dependency-free assets.

## Checked-in assets

- `docs/demo-assets/receipt-flow-demo.svg` - animated SVG storyboard source for `Vault -> Policy -> Context Pack -> Model Boundary -> Receipt -> Verifier`.
- `docs/demo-assets/demo-assets-manifest.json` - deterministic manifest with byte counts, SHA-256 checksums, the storyboard sequence, and claim boundaries.
- `scripts/build-demo-assets.mjs` - dependency-free Node.js generator.

The SVG is public-safe marketing/demo material. It illustrates Enigma-controlled state, policy checks, context-pack creation, receipt emission, and offline verification. It does not prove provider deletion, model forgetting, hosted readiness, compliance certification, or customer deployment status.

## Regenerate from source

From the package checkout:

```sh
cd enigma
npm run demo:assets
```

Optional output directory:

```sh
node scripts/build-demo-assets.mjs --out-dir docs/demo-assets
```

The script uses only Node.js built-ins, creates the output directory when needed, and writes deterministic UTF-8 files. A successful run prints JSON with `ok`, `schema`, `version`, `out_dir`, `files`, and `root_sha256`.

## Check manifest hashes

Use the manifest as the source of truth for the source asset that was generated:

```sh
cd enigma
node --input-type=module -e "import { createHash } from 'node:crypto'; import { readFile } from 'node:fs/promises'; const manifest = JSON.parse(await readFile('docs/demo-assets/demo-assets-manifest.json', 'utf8')); for (const file of manifest.output_files) { const bytes = await readFile('docs/demo-assets/' + file.path); const hash = createHash('sha256').update(bytes).digest('hex'); if (hash !== file.sha256) throw new Error(file.path + ' checksum mismatch'); console.log(file.path + ' sha256:' + hash); }"
```

## Convert to GIF or video outside the repo

Do not check generated GIF/MP4/WebM binaries into the repository unless a release owner explicitly requests them. Keep conversions in a local scratch directory or approved release artifact store.

Example static PNG frame with Inkscape:

```sh
mkdir -p .enigma/demo-render
inkscape docs/demo-assets/receipt-flow-demo.svg \
  --export-type=png \
  --export-filename=.enigma/demo-render/receipt-flow-demo.png
```

Example MP4 from the animated SVG with a browser capture workflow:

1. Open `docs/demo-assets/receipt-flow-demo.svg` in a local browser.
2. Record the window with an approved screen recorder for one or two animation loops.
3. Trim locally with `ffmpeg` if available:

```sh
ffmpeg -i local-capture.mov -vf "fps=30,scale=1210:-2" -movflags +faststart .enigma/demo-render/receipt-flow-demo.mp4
```

Example GIF from rendered frames if a local renderer is available:

```sh
ffmpeg -framerate 30 -i .enigma/demo-render/frame-%04d.png \
  -vf "fps=15,scale=900:-1:flags=lanczos" \
  .enigma/demo-render/receipt-flow-demo.gif
```

These commands are optional operator workflows. They are not package gates, do not require credentials, and should not mutate website, deploy, Cloudflare, npm, or GitHub state.

## Storyboard narration boundary

Safe narration:

```text
Enigma keeps the canonical memory lifecycle in Enigma-controlled state. A policy check selects a plaintext-minimized context pack, the model boundary treats provider-native memory as cache only, and a receipt can be verified offline.
```

Do not narrate that Enigma deleted provider data, made a model forget, certified compliance, proved hosted/BYOC availability, or guaranteed an operational outcome.
