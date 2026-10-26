/**
 * Start Expo for physical devices (dev client).
 * LAN by default; pass --tunnel for ngrok (works across networks).
 */
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const METRO_PORT = 8081;

function readAppScheme() {
  try {
    const appJson = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
    return appJson?.expo?.scheme ?? "exp";
  } catch {
    return "exp";
  }
}

function pickLanIPv4() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const ifaces of Object.values(nets)) {
    for (const net of ifaces ?? []) {
      if (net.family !== "IPv4" || net.internal) continue;
      candidates.push({ address: net.address, name: net.name ?? "" });
    }
  }
  const wifiFirst = candidates.find(
    (c) =>
      /wi-?fi|wlan/i.test(c.name) &&
      (c.address.startsWith("192.168.") || c.address.startsWith("10."))
  );
  if (wifiFirst) return wifiFirst.address;
  const preferred = candidates.find(
    (c) => c.address.startsWith("192.168.") || c.address.startsWith("10.")
  );
  return preferred?.address ?? candidates[0]?.address ?? "127.0.0.1";
}

function pidsOnPort(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const pid = Number.parseInt(line.trim().split(/\s+/).at(-1), 10);
        if (pid > 0) pids.add(pid);
      }
      return [...pids];
    }
    const out = execSync(`lsof -ti :${port} -sTCP:LISTEN`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return out
      .split(/\r?\n/)
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => n > 0);
  } catch {
    return [];
  }
}

function isNodeProcess(pid) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      return out.toLowerCase().includes("node.exe");
    }
    const out = execSync(`ps -p ${pid} -o comm=`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return /node/i.test(out);
  } catch {
    return false;
  }
}

function stopProcess(pid) {
  if (process.platform === "win32") {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
  } else {
    execSync(`kill -9 ${pid}`, { stdio: "ignore" });
  }
}

function freeStaleMetro(port) {
  for (const pid of pidsOnPort(port)) {
    if (!isNodeProcess(pid)) continue;
    console.log(`Stopping stale Metro (node PID ${pid}) on port ${port}...`);
    try {
      stopProcess(pid);
    } catch {
      console.warn(`Could not stop PID ${pid}. Close it manually, then run npm start again.`);
    }
  }
}

function tryWindowsFirewall() {
  if (process.platform !== "win32") return;
  const ps1 = path.join(root, "scripts", "allow-metro-firewall.ps1");
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, {
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch {
    // optional
  }
}

function printConnectHelp({ mode, lanIp, scheme, useGo }) {
  console.log("");
  console.log("══════════════════════════════════════════════════════════");
  console.log("  Connect from the Arena DEV app (not iOS Camera)");
  console.log("══════════════════════════════════════════════════════════");
  if (mode === "tunnel") {
    console.log("  TUNNEL mode — scan the QR below AFTER ngrok URL appears.");
    console.log("  Tunnel URL changes every npm start; do not reuse yesterday's link.");
    console.log("  Opening Arena from the home screen = black screen (stale URL).");
  } else {
    const httpUrl = `http://${lanIp}:${METRO_PORT}`;
    const expUrl = `exp://${lanIp}:${METRO_PORT}`;
    console.log(`  LAN: ${expUrl}`);
    console.log(`  Browser test (phone): ${httpUrl}/status`);
    console.log(`  Deep link: ${scheme}://expo-development-client/?url=${encodeURIComponent(httpUrl)}`);
  }
  console.log(`  Mode: ${useGo ? "Expo Go (--go)" : "development build (--dev-client)"}`);
  console.log("  Black screen? Shake phone → Reload, or kill Arena and scan fresh QR.");
  console.log("══════════════════════════════════════════════════════════");
  console.log("");
}

const rawArgs = process.argv.slice(2);
const useGo = rawArgs.includes("--go");
const useTunnel =
  rawArgs.includes("--tunnel") ||
  (rawArgs.includes("--host") && rawArgs[rawArgs.indexOf("--host") + 1] === "tunnel");
const passthrough = rawArgs.filter(
  (a, i, arr) =>
    a !== "--go" &&
    a !== "--tunnel" &&
    a !== "--lan" &&
    a !== "--localhost" &&
    !(a === "--host" && ["tunnel", "lan", "localhost"].includes(arr[i + 1] ?? "")) &&
    !(["tunnel", "lan", "localhost"].includes(a) && arr[i - 1] === "--host")
);

const detectedIp = pickLanIPv4();
const envHost = process.env.REACT_NATIVE_PACKAGER_HOSTNAME?.trim();
let lanIp = detectedIp;

if (useTunnel) {
  // Forcing a LAN IP breaks tunnel — let Expo/ngrok set the public host.
  delete process.env.REACT_NATIVE_PACKAGER_HOSTNAME;
} else {
  if (envHost && envHost !== detectedIp) {
    console.warn("");
    console.warn(`⚠  Stale IP in .env: REACT_NATIVE_PACKAGER_HOSTNAME=${envHost}`);
    console.warn(`   This PC is now ${detectedIp} — using ${detectedIp}.`);
    console.warn("");
  } else if (envHost) {
    lanIp = envHost;
  }
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME = lanIp;
}

const scheme = readAppScheme();

freeStaleMetro(METRO_PORT);
if (!useTunnel) tryWindowsFirewall();

if (useTunnel) {
  console.log("Starting Metro with TUNNEL (ngrok) — wait for the tunnel URL / QR…");
} else {
  console.log(`Metro host: ${lanIp}:${METRO_PORT}`);
}
printConnectHelp({ mode: useTunnel ? "tunnel" : "lan", lanIp, scheme, useGo });

const expoCli = path.join(root, "node_modules", "expo", "bin", "cli");
const hostArgs = useTunnel ? ["--tunnel"] : ["--host", "lan"];
const startArgs = [
  "start",
  ...hostArgs,
  ...(useGo ? ["--go"] : ["--dev-client"]),
  ...passthrough,
];

const child = spawn(process.execPath, [expoCli, ...startArgs], {
  stdio: "inherit",
  env: process.env,
  cwd: root,
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
