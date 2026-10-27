# JSON Studio

A static JSON / JSONL formatter that runs entirely in your browser. No server, installation, or build step is required.

## Features

- Validate and format with JSON Format or Ctrl+Enter (macOS: Command+Enter).
- Resize the input vertically using its lower-right corner. Use Expand to fill the viewport, and Restore or Escape to return.
- Switch between full-width Input and Output tabs. Formatting automatically opens Output; Go to error returns to Input.
- Expand or collapse objects and arrays individually or together.
- Automatically detect JSON and JSONL and display both in the same tree interface.
- Search keys and values in the tree, copy output, open files, and download results.
- Preserve original number notation, large integers, key order, and duplicate keys.
- Process data locally without uploading it or writing it to browser storage.
- No external CDN, font, or library dependencies.
- Responsive layout, empty on startup, with no example menu or preloaded sample data.

## Deploy to GitHub Pages

Extract the deployment ZIP and upload `index.html`, `style.css`, `parser.js`, `app.js`, and `.nojekyll` to the root of your GitHub repository. You can also include `README.md` and `tests/`.

Open **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, and select **main / (root)**. Click **Save**.

Official instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

No npm installation or build command is needed. Relative asset paths support repository subpaths. You can also open `index.html` directly for local use.

In the development repository, `dist/` contains the deployable files. The deployment ZIP places these files at its root.

## Format detection

1. If the entire input is valid JSON, it is treated as JSON.
2. Otherwise, if each nonblank line contains one complete JSON value, it is treated as JSONL.
3. JSONL requires one record per line. Escape line breaks inside strings as `\n`.
4. A single JSONL record is indistinguishable from JSON and is displayed as JSON.
5. Blank lines and a leading UTF-8 BOM are accepted.

JSONL records use the same collapsible tree as JSON. Clipboard output and downloaded files preserve one record per line instead of converting the records into a JSON array.

## Limits

- Maximum input or file size: 10 MiB. Displayed KB and MB use 1024-based units.
- Maximum nesting depth: 200 levels.
- Large objects, arrays, and JSONL record lists are displayed in batches of 150. Use the next-items button to load more.
- Expand all limits expansion to roughly 10,000 displayed nodes. Individual nodes can still be opened.
- Search applies to the most recently formatted result. Click JSON Format again after editing the input.
- Comments, single-quoted property names, and trailing commas are not supported.
- Whitespace and indentation are normalized; values, number notation, key order, and duplicate keys are preserved.

## Validation

Run `node tests/parser.test.cjs` from the project directory.
