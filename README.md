# Attachment Size Bundler / 附件大小分包

A bilingual, local browser tool that groups selected files into ZIP STORE archives under an exact archive-size limit and produces a JSON index. It accepts up to 100 files and 64 MiB of source bytes; the ZIP cap includes archive overhead. Individual files are never split or compressed. Inputs stay in page memory.

## Run and build

Use Node.js 24 (>=24 <25) and its bundled npm. There are no dependencies and no install step.

```sh
npm run check
npm run build
npm run build:release
npm run check:release
npm test
```

`dist/` is the noindex local preview. `release-artifacts/site/` is the separate 15-file release candidate; its sibling manifest makes 16 release artifacts in total. Generated outputs are ignored by Git. Release commands reject altered, extra, or unsafe output files instead of silently overwriting them. Build a fresh output directory when changing source.

For a local preview, `npm run dev` listens only at http://127.0.0.1:4227. This command does not open a browser. Chinese is at /index.html and English at /en/index.html.

## Review status

This is a source-publication snapshot. Production hosting, actual hosting redirects/headers, homepage inclusion, and external acceptance are separate release steps. See [HANDOFF](HANDOFF.md) for exact scope, verified artifact hashes, accepted prior evidence, and remaining manual checks.

The [product](PRODUCT.md), [technical specification](TECHNICAL.md), [UX/SEO specification](UX-SEO.md), and [acceptance oracle](ACCEPTANCE.md) are preserved authoring records; their original NOT_RUN_SPEC_ONLY labels describe their creation time. The current verification scope is in HANDOFF. [Design system](docs/DESIGN-SYSTEM.md) and [privacy/lifecycle rules](docs/PRIVACY-SECURITY.md) accompany the source. [Synthetic examples](fixtures/README.md) contain no user files.

STORE does not reduce data size, the packing heuristic does not guarantee the fewest archives, mail transport encoding is outside the cap, and browser memory use may exceed the input size. Clearing page references cannot erase saved downloads or guarantee secure memory erasure.
