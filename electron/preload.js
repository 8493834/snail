const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("snailNative", {
  // Run a block. Output arrives live through onChunk; typed lines go in through stdin.
  run: (lang, code, n, id) => ipcRenderer.invoke("snail:run", lang, code, n, id),
  stdin: (id, text) => ipcRenderer.send("snail:stdin", id, text),
  kill: (id) => ipcRenderer.send("snail:kill", id),
  onChunk: (cb) => ipcRenderer.on("snail:chunk", (_e, msg) => cb(msg)),
  onOpen: (cb) => ipcRenderer.on("snail:open", (_e, file) => cb(file)),
});
