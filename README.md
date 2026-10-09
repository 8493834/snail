# Snail app (Windows + Android)

One codebase, two apps. Both are built for free by GitHub Actions - you don't need to install anything.

- `www/`       the shared UI and the Snail parser (`snail-core.js`)
- `electron/`  Windows wrapper. Also runs `java` and `python` blocks (needs a JDK / Python installed on the PC)
- `.github/workflows/build.yml`  builds `Snail Setup.exe` and `app-debug.apk` in the cloud
- `.github/workflows/pages.yml`  publishes the free web preview (GitHub Pages)

| Block language | Windows | Android | Web preview |
|---|---|---|---|
| html | yes | yes | yes |
| js / javascript | yes | yes | yes |
| python | yes (if Python is installed) | yes (bundled) | yes (bundled) |
| java | yes (if a JDK is installed) | online service | online service |

## Get your apps (about 10 minutes, free)

1. Make a free account at github.com and create a **New repository** (any name, Public or Private).
2. Upload this whole folder. Easiest: on the empty repo page click **uploading an existing file**,
   drag everything in, and commit.
   **Check that `.github/workflows/build.yml` is there** (hidden folders are sometimes skipped). If not:
   *Add file > Create new file*, type `.github/workflows/build.yml` as the name and paste in the contents.
3. Open the **Actions** tab. The "Build Snail apps" workflow runs automatically (or press *Run workflow*).
   It takes about 5-10 minutes.
4. Click the finished run. Under **Artifacts** download `snail-windows` and `snail-android`.

## Free web preview (GitHub Pages)

The same app runs in any browser, including Python. One-time setup:

1. The repository must be **Public**. Free GitHub accounts can't use Pages on private repos.
   The site is public to anyone with the link, so don't put secrets in it.
2. In the repo go to **Settings > Pages**, and under **Build and deployment > Source** choose **GitHub Actions**.
3. Go to the **Actions** tab and run **Deploy web preview** (it also runs on every push).
4. After about 2 minutes your site is at `https://YOUR-USERNAME.github.io/YOUR-REPO/`
   (the link is also shown on the finished workflow run).

Files you open or write stay on your own device: the page runs entirely in your browser, and **Save**
downloads a `.snail` file.

## Installing

- **Windows:** unzip and run the `Setup .exe` (installs and makes `.snail` / `.cofigsnail` files open in Snail)
  or the portable `.exe` (no install). The app isn't code-signed, so Windows SmartScreen will warn you:
  *More info > Run anyway*.
- **Android:** unzip, copy `app-debug.apk` to your phone and open it. Allow "install unknown apps" when asked.

## Save

The **Save** button uses the name in the box at the top (`.snail` is added if missing).
On Windows it opens a normal "Save as" dialog. On Android it opens the share sheet, so you can
send the file to Files, Drive, email, etc.

## Java on the web and Android

Browsers and phones can't run Java, so `java` blocks are sent to a free public service,
[Judge0 CE](https://ce.judge0.com), which compiles and runs them and sends back the output.

- The app asks permission the first time. **Your java code leaves your device**, so don't use it for secrets.
  The Windows app never does this: it runs Java with your own JDK.
- The service is shared and free, so it can be slow, rate-limited, or occasionally offline.
- Your class can have any name; the app adapts it to the `Main` class the service requires. Bare statements
  (no class) are wrapped in a `main` method, and `import` lines are moved to the top.
- To use your own Judge0 server instead, change `JAVA_SERVICE` near the top of the script in `www/index.html`.

## Python on Android

Android runs `python` blocks with Pyodide (real Python compiled to WebAssembly). The build copies it into the
app (about 12 MB extra), so it works offline. The first Python run takes a few seconds to start. Only Python's
standard library is included, and each block runs in a fresh scope.

## Try it on your PC without GitHub

    npm install
    npm start

## Notes

- Android is pinned to Capacitor 6 + Java 17 (a known-good combination). Upgrade later if you like.
- The app only needs the internet for java blocks; everything else works offline.
- To add a language for Windows, add a branch in `electron/main.js`. For both platforms, browser-safe
  languages go in `www/index.html` (the `run` handler).
