// Desktop shell (Windows, macOS, Linux): opens the UI and runs java/python blocks with tools installed on the PC.
const { app, BrowserWindow, ipcMain } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let mainWin = null;
let pendingFile = null; // macOS "open-file" can arrive before the window exists
const SNAIL_FILE = /\.(snail|cofigsnail|configsnail)$/i;

function sh(cmd, args, cwd) {
  return new Promise((resolve) =>
    execFile(cmd, args, { cwd, timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
      if (err && err.code === "ENOENT") return resolve({ missing: true });
      const timeout = err && err.killed ? "\n(stopped: took longer than 60s)" : "";
      resolve({ ok: !err, out: (stdout || "") + (stderr || "") + timeout });
    })
  );
}

ipcMain.handle("snail:run", async (_e, lang, code, n) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snail-"));
  try {
    if (lang === "python" || lang === "py") {
      const file = path.join(dir, `block${n}.py`);
      fs.writeFileSync(file, code);
      // Windows: python / py launcher. macOS + Linux: python3 first.
      const tries = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
      let r = { missing: true };
      for (const cmd of tries) { r = await sh(cmd, [file]); if (!r.missing) break; }
      return r.missing ? { ok: false, out: "Python was not found. Install it from python.org." } : r;
    }
    if (lang === "java") {
      const cls0 = (code.match(/\bpublic\s+(?:final\s+|abstract\s+)*class\s+(\w+)/) ||
                    code.match(/\bclass\s+(\w+)/) || [])[1];
      let cls = cls0;
      let src = code;
      if (!cls) {
        cls = `SnailBlock${n}`;
        src = `public class ${cls} {\n  public static void main(String[] args) throws Exception {\n${code}\n  }\n}\n`;
      }
      fs.writeFileSync(path.join(dir, `${cls}.java`), src);
      const compiled = await sh("javac", [`${cls}.java`], dir);
      if (compiled.missing) return { ok: false, out: "Java was not found. Install a JDK (e.g. Temurin 17)." };
      if (!compiled.ok) return compiled;
      const ran = await sh("java", ["-cp", dir, cls]);
      return ran.missing ? { ok: false, out: "Java was not found. Install a JDK (e.g. Temurin 17)." } : ran;
    }
    return { ok: false, out: `no runner for language '${lang}'` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function sendFile(path_) {
  try {
    const f = { name: path.basename(path_), text: fs.readFileSync(path_, "utf8") };
    if (mainWin && !mainWin.webContents.isLoading()) mainWin.webContents.send("snail:open", f);
    else if (mainWin) mainWin.webContents.once("did-finish-load", () => mainWin.webContents.send("snail:open", f));
    else pendingFile = path_;
  } catch {}
}

// macOS: double-clicking a .snail file (or dropping it on the Dock icon) fires this, not argv.
app.on("open-file", (e, p) => { e.preventDefault(); sendFile(p); });

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin = win;
  win.on("closed", () => { mainWin = null; });
  win.loadFile(path.join(__dirname, "..", "www", "index.html"));

  // Windows/Linux: double-clicking a .snail file passes its path as an argument.
  const file = pendingFile || process.argv.slice(1).find((a) => SNAIL_FILE.test(a));
  pendingFile = null;
  if (file) sendFile(file);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on("window-all-closed", () => app.quit());
