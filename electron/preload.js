const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("snailNative", {
  run: (lang, code, n) => ipcRenderer.invoke("snail:run", lang, code, n),
  onOpen: (cb) => ipcRenderer.on("snail:open", (_e, file) => cb(file)),
});
