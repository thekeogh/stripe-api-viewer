import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { stripVTControlCharacters } from "node:util";

const require = createRequire(import.meta.url);
const port = process.argv[2] ?? "4387";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error("Choose a port between 1 and 65535.");
  process.exit(1);
}
const url = `https://localhost:${port}`;
const server = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--experimental-https",
    "--hostname",
    "localhost",
    "--port",
    port,
  ],
  { stdio: ["inherit", "pipe", "pipe"] },
);

let opened = false;
let stopping = false;

function openBrowser() {
  if (opened || stopping || process.env.BROWSER === "none") return;
  opened = true;
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  const browser = spawn(command, args, { stdio: "ignore" });
  const warn = () =>
    console.warn(`Could not open your browser automatically. Open ${url}`);
  browser.on("error", warn);
  browser.on("exit", (code) => {
    if (code !== null && code !== 0) warn();
  });
  browser.unref();
}

// Wait for this server's ready message, so an occupied port never opens another app.
function forward(source, destination) {
  let tail = "";
  source.on("data", (chunk) => {
    destination.write(chunk);
    tail = (tail + stripVTControlCharacters(chunk.toString())).slice(-2048);
    if (/Ready in\s+\d/.test(tail)) openBrowser();
  });
}
forward(server.stdout, process.stdout);
forward(server.stderr, process.stderr);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    server.kill(signal);
  });
}
server.on("error", (error) => {
  console.error(`Could not start Stripe API Viewer: ${error.message}`);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  stopping = true;
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
});
