import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const watchedPaths = [
  path.join(projectRoot, "server"),
  path.join(projectRoot, "index.html"),
  path.join(projectRoot, "script.js"),
  path.join(projectRoot, "styles.css"),
];

let serverProcess = null;
let restartTimer = null;

const startServer = () => {
  serverProcess = spawn(process.execPath, [path.join(projectRoot, "server", "index.js")], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  serverProcess.on("exit", (code, signal) => {
    if (signal !== "SIGTERM" && code && code !== 0) {
      console.log(`dev-server: server exited with code ${code}`);
    }
  });
};

const stopServer = () => {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  serverProcess.kill("SIGTERM");
  serverProcess = null;
};

const restartServer = () => {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log("dev-server: change detected, restarting server...");
    stopServer();
    startServer();
  }, 150);
};

for (const watchedPath of watchedPaths) {
  watch(watchedPath, { recursive: true }, (_eventType, fileName) => {
    if (!fileName || fileName.endsWith("~")) {
      return;
    }

    restartServer();
  });
}

process.on("SIGINT", () => {
  stopServer();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopServer();
  process.exit(0);
});

console.log("dev-server: watching files for changes...");
startServer();