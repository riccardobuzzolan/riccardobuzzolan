const fs = require("node:fs");
const { spawn } = require("node:child_process");

const TARGET = "https://scadenze-fiscali.vercel.app/";
const CHROME_PORT = 9234;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capture(width, height, file) {
  const tab = await (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(JSON.stringify(message.error)));
    else task.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: width < 600,
    screenWidth: width, screenHeight: height,
  });
  await send("Page.navigate", { url: TARGET });
  await delay(7500);
  const info = await send("Runtime.evaluate", {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll("button, [role=button]"));
      const deny = buttons.find(b => /^(rifiuta|rifiuta tutto|rifiuta tutti|solo necessari|continua senza|non accetto)/i.test((b.textContent || b.getAttribute("aria-label") || "").trim()));
      if (deny) deny.click();
      window.scrollTo(0,0);
      return {
        title: document.title,
        url: location.href,
        text: document.body.innerText.slice(0,400),
        consentClicked: !!deny,
        width: innerWidth,
        height: innerHeight
      };
    })()`,
    returnByValue: true,
  });
  console.log("Page:", JSON.stringify(info.result.value));
  const details = info.result.value;
  if (!details || !/scadenz|fiscal/i.test(details.title + " " + details.text)) {
    throw new Error("Expected fiscal website content not found");
  }
  await delay(1800);
  await send("Runtime.evaluate", { expression: "window.scrollTo(0,0)" });
  const png = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: false, fromSurface: true,
  });
  fs.mkdirSync("docs/images", { recursive: true });
  fs.writeFileSync(file, Buffer.from(png.data, "base64"));
  console.log("Screenshot:", file, fs.statSync(file).size, "bytes");
  socket.close();
}
(async () => {
  const chrome = spawn("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + CHROME_PORT,
    "--user-data-dir=/tmp/fiscal-screenshot-" + process.pid,
    "about:blank",
  ], { stdio: "ignore" });
  try {
    let ready = false;
    for (let i = 0; i < 70; i++) {
      try {
        const result = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`);
        if (result.ok) { ready = true; break; }
      } catch {}
      await delay(200);
    }
    if (!ready) throw new Error("Chrome remote debugging did not start");
    await capture(1440, 900, "docs/images/scadenze-fiscali.png");
    await capture(390, 844, "docs/images/scadenze-fiscali-mobile.png");
  } finally {
    chrome.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
