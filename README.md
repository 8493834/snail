# Snail app

One codebase, five platforms.

| Platform | Tech | How to build | Output |
|---|---|---|---|
| Windows | Electron | `npm run dist:win` | `dist/*.exe` |
| macOS | Electron | `npm run dist:mac` (on a Mac) | `dist/*.dmg`, `*.zip` (universal Intel + Apple Silicon) |
| Linux | Electron | `npm run dist:linux` | `dist/*.AppImage`, `*.deb` |
| Android | Capacitor | CI job `android` | `app-debug.apk` |
| iOS | Capacitor | CI job `ios` (needs macOS + Xcode) | unsigned `.ipa` + Simulator `.app` |

All of them are built automatically by **Actions -> Build Snail apps** on every push; download the files from the run's Artifacts.
There is also a free web version (see "Free web preview" below).

- `www/`       the shared UI and the Snail parser (`snail-core.js`)
- `electron/`  the desktop wrapper (Windows, macOS, Linux)
- `examples/`  `hello.snail`, and `guess.snail` (a small game that uses `input()`)
- `.github/workflows/build.yml`  builds all five apps in the cloud
- `.github/workflows/pages.yml`  publishes the free web preview (GitHub Pages)

## What runs where

| Block language | Desktop | Android / iOS | Web preview |
|---|---|---|---|
| html | yes | yes | yes |
| js / javascript | yes | yes | yes |
| python | yes (if Python is installed) | yes (bundled) | yes (bundled) |
| java | yes (if a JDK is installed) | online service | online service |
| typing input (`input()`) | yes | yes (see below) | yes (see below) |

## Notes per platform
- **Desktop (Windows/macOS/Linux):** python and java blocks run with the Python / JDK installed on the computer (`python3` on macOS/Linux). html and js always work.
- **macOS:** builds are unsigned. First launch: right-click the app -> Open (or `xattr -cr /Applications/Snail.app`). To sign/notarize, set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` in the repo secrets and remove `"identity": null` from `package.json`.
- **Linux:** `chmod +x Snail-*.AppImage && ./Snail-*.AppImage`, or `sudo apt install ./snail-app_*.deb`.
- **iOS:** an iPhone only runs signed apps. The CI `.ipa` is unsigned: sign it with your Apple ID (Sideloadly, AltStore, or open `ios/` in Xcode after `npx cap add ios`) or add your Apple Developer certificates to ship via TestFlight. Python runs on-device (Pyodide); Java uses the online service, like Android.
- **Windows:** the app isn't code-signed, so SmartScreen will warn you on first run: *More info > Run anyway*.
- **Android:** copy `app-debug.apk` to your phone and open it. Allow "install unknown apps" when asked.

## Get your apps (about 10 minutes, free)

1. Make a free account at github.com and create a **New repository** (any name).
2. Upload this whole folder. Easiest: on the empty repo page click **uploading an existing file**,
   drag everything in, and commit.
   **Check that `.github/workflows/build.yml` and `pages.yml` are there** (hidden folders are sometimes skipped). If not:
   *Add file > Create new file*, type `.github/workflows/build.yml` as the name and paste in the contents.
3. Open the **Actions** tab. "Build Snail apps" runs automatically (or press *Run workflow*). It takes about 5-10 minutes.
4. Click the finished run. Under **Artifacts** download the app for your device.

## Free web preview (GitHub Pages)

The same app runs in any browser, including Python. One-time setup:

1. The repository must be **Public**. Free GitHub accounts can't use Pages on private repos.
   The site is public to anyone with the link, so don't put secrets in it.
2. In the repo go to **Settings > Pages**, and under **Build and deployment > Source** choose **GitHub Actions**.
3. Go to the **Actions** tab and run **Deploy web preview** (it also runs on every push).
4. After about 2 minutes your site is at `https://YOUR-USERNAME.github.io/YOUR-REPO/`
   (the link is also shown on the finished workflow run).

Files you open or write stay on your own device: the page runs entirely in your browser.

## Typing input in programs (games, questions)

Run `examples/guess.snail` to try it. While a program runs, the **Run** button turns into **Stop**.

- **Desktop:** python runs as a real program. Its output appears live, and whatever you type in the box under
  the output goes to the program, like a terminal. Java works the same way (`Scanner(System.in)`).
  **Stop** ends the program (on Windows it also ends anything the program started).
- **Web preview, Android and iOS:** Python runs in a background worker, so the page never freezes. A typing box
  appears under the output whenever the program asks a question, and the program waits until you press Enter
  (or **Send**). `time.sleep()` also waits properly, so text shows up as it is printed. **Stop** works at any
  time, even in a loop that never asks anything.
- That needs a browser with "JSPI" support: Chrome and Edge 137 or newer, and the Android app on an up-to-date
  Android System WebView. In other browsers (older ones, Firefox, and as far as I know iPhones and iPads at the
  moment) Python still runs, but `input()` asks in a pop-up box instead, and Cancel stops the program. In that
  mode a loop that never asks anything can't be interrupted (close the tab).
- `input()` and `sys.stdin.readline()` both work. Output is limited to the last ~400,000 characters so a chatty
  program can't fill the memory.
- Java in the web, Android and iOS versions can't take typed input, because the online service runs it all at once.

## Java on the web, Android and iOS

Browsers and phones can't run Java, so `java` blocks are sent to a free public service,
[Judge0 CE](https://ce.judge0.com), which compiles and runs them and sends back the output.

- The app asks permission the first time. **Your java code leaves your device**, so don't use it for secrets.
  The desktop apps never do this: they run Java with your own JDK.
- The service is shared and free, so it can be slow, rate-limited, or occasionally offline.
- Your class can have any name; the app adapts it to the `Main` class the service requires. Bare statements
  (no class) are wrapped in a `main` method, and `import` lines are moved to the top.
- To use your own Judge0 server instead, change `JAVA_SERVICE` near the top of the script in `www/index.html`.

## Save

The **Save** button uses the name in the box at the top (`.snail` is added if missing).
On desktop and the web it opens a normal "Save as" dialog. On Android and iOS it opens the share sheet, so you can
send the file to Files, Drive, email, etc.

## Python on Android, iOS and the web

These run `python` blocks with Pyodide (real Python compiled to WebAssembly). The build copies it into the
app (about 12 MB extra), so it works offline. The first Python run takes a few seconds to start. Only Python's
standard library is included, and each block runs in a fresh scope.

The Pyodide version is pinned to `0.27.8` in `package.json`, and the same version is used for the internet backup
(`PY_CDN` in `www/index.html`). If you change one, change the other.

### "Python runtime isn't included" / slow first Python run

The offline Python files are added by the GitHub build, so they exist on your `github.io` site and in the
mobile apps, but **not** if you open `www/index.html` straight from the repo or from your computer.
In that case the app downloads Python from the internet instead (needs a connection, first run is slower).

## Try it on your computer without GitHub

    npm install
    npm start

## Notes

- Android is pinned to Capacitor 6 + Java 17 (a known-good combination). Upgrade later if you like.
- The app only needs the internet for java blocks (and for Python when it isn't bundled); everything else works offline.
- To add a language for the desktop apps, add a branch in `electron/main.js`. For all platforms, browser-safe
  languages go in `www/index.html` (the `run` handler).

## Free web preview (GitHub Pages)

The same app runs in any browser. One-time setup: make the repo **Public**, then **Settings -> Pages -> Source: GitHub Actions**,
then run **Actions -> Deploy web preview**. Your site is at `https://YOUR-USERNAME.github.io/YOUR-REPO/` after about 2 minutes.
Files you open or save stay on your own device.

## What runs where

| Block language | Desktop | Android / iOS | Web preview |
|---|---|---|---|
| html, js | yes | yes | yes |
| python | yes (needs Python installed) | yes (bundled) | yes (bundled) |
| java | yes (needs a JDK) | online service | online service |

## Typing input in Python programs (games, questions)

`input()` works everywhere. Try `examples/guess.snail`.

- **Desktop:** the program runs as a real process. Output appears live and what you type in the box under the output goes to the
  program, like a terminal. Java works too (`Scanner(System.in)`). **Stop** ends the program (the whole process tree on Windows).
- **Web, Android, iOS:** Python runs in a background worker, so the page never freezes. The typing box appears when the program asks a
  question and the program waits for you. `time.sleep()` waits properly and text shows as it is printed. **Stop** works any time,
  even on an endless loop. This needs "JSPI" (Chrome / Edge 137+ and a current Android System WebView). Older browsers, Firefox and
  Safari fall back to a pop-up box for each question, and Cancel stops the program.
- Java in the web / Android / iOS versions can't take typed input (the online service runs it all at once).

## Java on the web, Android and iOS

Browsers and phones can't run Java, so `java` blocks are sent to the free public service [Judge0 CE](https://ce.judge0.com). The app asks
permission first, **your java code leaves your device**, and the service can be slow, rate-limited or offline. Desktop never does this.
To use your own Judge0 server, change `JAVA_SERVICE` near the top of the script in `www/index.html`.

## Python offline files

The build copies Pyodide (Python compiled to WebAssembly, about 12 MB) next to the app, so it works offline. If you open `www/index.html`
straight from disk those files are missing, so the app downloads Python from the internet instead. The Pyodide version is pinned in
`package.json` and in `PY_CDN` in `www/index.html`; keep the two equal.

## Making Snail programs from ordinary files (`tools/snailify.py`)

    python3 tools/snailify.py page.html script.js tool.py -o my.snail

Each file becomes one code block (by extension: `.html`, `.js`, `.py`, `.java`, or name the language: `notes.txt:python`).
Snail deletes `#ss#` comments and ends a block at the first end tag, even inside a block, so code containing those breaks.
snailify finds them and stops; add `--escape` to rewrite them so the code means the same thing, then it checks that Snail reads every
block back exactly. Regex literals and raw strings (`r"..."`) can't be fixed automatically; snailify warns about them. `--inline` puts `<script src="x.js">` files inside the page,
`--note "text"` adds a comment at the top. Needs Python 3 and Node.

**In the browser (no Python or Node needed):** the web preview also has a Snailify page at `https://YOUR-USERNAME.github.io/YOUR-REPO/snailify.html`
(files `www/snailify.html` + `www/snailify-core.js`). Drop your files in, tick **Escape** if needed, press **Make .snail**, then Download or Copy.
It follows the same rules as the Python tool and produces identical output (it is checked with Snail's own parser too). Differences: Python syntax and
`type="module"` scripts aren't syntax-checked there, and `--inline` matches `<script src>` files by name among the files you added.
Both versions warn about lines where escaping may change meaning (JS regex literals, `String.raw`, Python raw strings); in a JS regex write
`<cod(?:e)?>` instead of the end-tag text. Hazards inside `<style>` must be fixed by hand.

**Snail inside Snail:** `examples/snail-in-snail.snail` is the whole app as one html block (open it in Snail and press Run). Rebuild it
after changing the app with
`python3 tools/snailify.py www/index.html --inline --escape --note "Snail running inside Snail. Run this file in Snail." -o examples/snail-in-snail.snail`.

## Downloads (GitHub Releases)

To get a download page with every app on it: **Releases -> Draft a new release -> Choose a tag**, type a new tag such as `v1.2.0`
(**Create new tag**), then **Publish release**. The build runs (about 10-15 minutes) and attaches the `.exe`, `.apk`, `.dmg`, `.AppImage`,
`.deb` and `.ipa` files to that release. Anyone can download them from the Releases page; private repos share them only with people who
can see the repo. If one platform fails, the others are still attached. (GitHub Packages is for code libraries and containers, so
Releases is the right place for apps.)
