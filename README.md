# Chef's Choice

A portfolio site for Chef's Choice, a recipe app Andy Hannah designed and built with Claude Code.

- `index.html` is a short case study of the app and how it was built.
- `demo/` is the app itself, running in the browser on three sample recipes.

## What the demo is

`demo/` is the app's own front end, built from its source with Vite and unchanged. The app's
server is not here, so a script in the page, `demo/stub.js`, answers the app's requests. It
replays answers the app's own server code gave for the three sample recipes, which are in
`demo/recorded.js`. It keeps a cook log in memory, so a reload clears it. `demo/fences.css` hides
the controls that need a real server, such as signing out, importing, and making a new recipe.

The three recipes and the imported page in the case study are originals made for this demo.

The login photo in `demo/assets/` is Andy Hannah's own. The photos in `demo/images/` are stock
images, used under their licenses, and `licenses/photos.txt` credits each one. They went in through the
app's own photo upload, which resized each one and kept no metadata.

## Built from

Commit `d5caa9c` of the app's repository, which is private, on 25 November 2026.

## Serving it

The demo loads as an ES module, which browsers refuse to load from a `file://` address. Serve the
folder over HTTP. Any static host works, at a domain's root or in a subfolder, and so does
`python3 -m http.server` in this folder. The empty `.nojekyll` tells GitHub Pages to serve the
files as they are.

## Licenses

The site ships four fonts, Spectral, Inter, Caveat, and Kalam. All four are under the SIL Open Font
License 1.1, and `licenses/` holds each one's text.

The app's bundle carries 19 npm packages, among them TipTap and ProseMirror.
`licenses/third-party.txt` gives each one's name, version, and license text.
