const { app, BrowserWindow, shell, session, Menu } = require("electron");
const path = require("path");

// ── Production URL or local build ─────────────────────────────────────────
const NEXA_URL = "https://nexa.gg"; // change to your domain

// ── Prevent multiple instances ────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Nexa",
    // Hide frame on mac for native look; show on Win/Linux
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Block remote devtools
      devTools: false,
    },
    // Dark background while loading
    backgroundColor: "#0B0B0F",
    show: false,
  });

  // ── KEY: block screenshot / screen recording on all platforms ────────────
  // macOS: window excluded from screenshots and screen recording
  // Windows: uses WDA_EXCLUDEFROMCAPTURE (Win 10 2004+) so the window
  //          appears black in any capture tool incl. Win+PrintScreen
  mainWindow.setContentProtection(true);

  // ── Remove default menu (hides devtools shortcut) ─────────────────────
  Menu.setApplicationMenu(null);

  // ── Load the app ──────────────────────────────────────────────────────
  mainWindow.loadURL(NEXA_URL);

  // Show window once content is ready (no white flash)
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open external links in default browser, not in Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Block navigation away from the app URL
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(NEXA_URL)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Block all permission requests (camera/mic handled in-app via web APIs)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ["media", "notifications", "clipboard-read"];
    callback(allowed.includes(permission));
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Focus existing window when second instance tries to launch
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
