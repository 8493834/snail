// Desktop shell (Windows, macOS, Linux): opens the UI and runs java/python blocks with tools installed on the computer.
// Programs run as real processes. Their output streams to the window live, and the window's
// input box is wired to the process's stdin, so input() / Scanner behave like in a terminal.
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let mainWin = null;
let pendingFile = null; // macOS "open-file" can arrive before the window exists
const SNAIL_FILE = /\.(snail|cofigsnail|configsnail)$/i;

const procs = new Map();   // run id -> running child process
const stopped = new Set(); // run ids the user pressed Stop on

// Stop a process. On Windows the `py` launcher starts python as a child, so kill the whole tree.
function killProc(child) {
  if (process.platform === "win32" && child.pid) {
    try { spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }).on("error", () => child.kill()); return; } catch {}
  }
  child.kill();
}

// One-shot command with captured output (used for the java compiler).
function sh(cmd, args, cwd) {
  return new Promise((resolve) =>
    execFile(cmd, args, { cwd, timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
      if (err && err.code === "ENOENT") return resolve({ missing: true });
      const timeout = err && err.killed ? "\n(stopped: took longer than 60s)" : "";
      resolve({ ok: !err, out: (stdout || "") + (stderr || "") + timeout });
    })
  );
}

// Interactive run: stream output to the window, accept typed input, no time limit (Stop ends it).
// `commands` are tried in order until one exists (for example python, then py).
function runInteractive(sender, id, commands, args, cwd) {
  return new Promise((resolve) => {
    const send = (text, err) => {
      if (!sender.isDestroyed()) sender.send("snail:chunk", { id, text, err: !!err });
    };
    const attempt = (i) => {
      if (i >= commands.length) return resolve({ missing: true });
      const child = spawn(commands[i], args, {
        cwd,
        windowsHide: true,
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      });
      let started = false;
      child.once("spawn", () => {
        started = true;
        procs.set(id, child);
      });
      child.once("error", (err) => {
        if (started) return send(String(err.message) + "\n", true);
        if (err.code === "ENOENT") return attempt(i + 1);        // not installed under that name; try the next
        resolve({ ok: false, out: `couldn't start ${commands[i]}: ${err.message}` });
      });
      child.stdin.on("error", () => {});                         // the program already exited
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (t) => send(t, false));
      child.stderr.on("data", (t) => send(t, true));
      child.once("close", (code) => {
        if (!started) return;
        procs.delete(id);
        const wasStopped = stopped.delete(id);
        resolve({ ok: !wasStopped && code === 0, out: !wasStopped && code ? `(exited with code ${code})` : "", stopped: wasStopped });
      });
    };
    attempt(0);
  });
}

ipcMain.on("snail:stdin", (_e, id, text) => {
  const child = procs.get(id);
  if (child && !child.stdin.destroyed) child.stdin.write(String(text));
});

ipcMain.on("snail:kill", (_e, id) => {
  const child = procs.get(id);
  if (child) {
    stopped.add(id);
    killProc(child);
  }
});

ipcMain.handle("snail:run", async (event, lang, code, n, id) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snail-"));
  try {
    if (lang === "python" || lang === "py") {
      const file = path.join(dir, `block${n}.py`);
      fs.writeFileSync(file, code);
      // Windows: python / py launcher. macOS + Linux: python3 first.
      const tries = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
      const r = await runInteractive(event.sender, id, tries, ["-u", file], dir);
      return r.missing ? { ok: false, out: "Python was not found. Install it from python.org." } : r;
    }
    if (lang === "sh" || lang === "bash" || lang === "shell") {
      const file = path.join(dir, `block${n}.sh`);
      fs.writeFileSync(file, code.replace(/\r\n/g, "\n"));
      // macOS + Linux: bash (or sh). Windows: needs bash from Git for Windows or WSL.
      const tries = lang === "sh" && process.platform !== "win32" ? ["sh", "bash"] : ["bash", "sh"];
      const r = await runInteractive(event.sender, id, tries, [file], dir);
      return r.missing ? { ok: false, out: process.platform === "win32"
        ? "bash was not found. Install Git for Windows (it includes bash) or WSL."
        : "bash/sh was not found on this computer." } : r;
    }
    if (lang === "java") {
      let cls = (code.match(/\bpublic\s+(?:final\s+|abstract\s+)*class\s+(\w+)/) ||
                 code.match(/\bclass\s+(\w+)/) || [])[1];
      let src = code;
      if (!cls) {                                  // bare statements: imports go on top, the rest inside main()
        cls = `SnailBlock${n}`;
        const lines = code.split("\n"), isImport = (l) => /^\s*import\s/.test(l);
        src = `${lines.filter(isImport).join("\n")}\npublic class ${cls} {\n  public static void main(String[] args) throws Exception {\n` +
              `${lines.filter((l) => !isImport(l)).join("\n")}\n  }\n}\n`;
      }
      fs.writeFileSync(path.join(dir, `${cls}.java`), src);
      const compiled = await sh("javac", [`${cls}.java`], dir);
      if (compiled.missing) return { ok: false, out: "Java was not found. Install a JDK (e.g. Temurin 17)." };
      if (!compiled.ok) return compiled;
      const r = await runInteractive(event.sender, id, ["java"], ["-cp", dir, cls], dir);
      return r.missing ? { ok: false, out: "Java was not found. Install a JDK (e.g. Temurin 17)." } : r;
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
  // links that point to a web page (like the new-version page) open in the real browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
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
app.on("window-all-closed", () => {
  for (const child of procs.values()) killProc(child);
  app.quit();
});
