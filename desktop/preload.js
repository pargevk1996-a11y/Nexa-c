// contextIsolation=true — inject a read-only desktop flag for the renderer.
"use strict";
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("__NEXA_DESKTOP__", true);
