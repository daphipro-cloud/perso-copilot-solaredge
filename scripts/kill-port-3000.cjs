// Kill all processes using TCP port 3000 (cross-platform)
const { execSync } = require('child_process');

const port = 3000;

try {
  if (process.platform === 'win32') {
    // Windows: find and kill processes using port 3000
    const output = execSync(`netstat -ano | findstr :${port}`).toString();
    const pids = [...new Set(output.match(/\d+$/gm))];
    if (pids.length === 0) {
      console.log(`No process found using port ${port}`);
    } else {
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`);
          console.log(`Killed process ${pid} using port ${port}`);
        } catch (err) {
          console.log(`Could not kill process ${pid}: ${err.message}`);
        }
      }
    }
  } else {
    // Unix/macOS: find and kill processes using port 3000
    const output = execSync(`lsof -i tcp:${port} -t || true`).toString();
    const pids = output.split(/\s+/).filter(Boolean);
    if (pids.length === 0) {
      console.log(`No process found using port ${port}`);
    } else {
      for (const pid of pids) {
        try {
          execSync(`kill -9 ${pid}`);
          console.log(`Killed process ${pid} using port ${port}`);
        } catch (err) {
          console.log(`Could not kill process ${pid}: ${err.message}`);
        }
      }
    }
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
}
