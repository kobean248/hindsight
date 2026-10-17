import { chromium } from "playwright-core";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3001";
const out = "C:/Users/harin/Hackathons/c0mpiled/.tmp-shots";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const errors = [];
async function shot(name, path, { width = 1440, height = 900, full = true, wait = 3000, scrollTo } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name} console: ${m.text()}`));
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(wait);
  if (full) {
    // scroll through to trigger reveals
    const h = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < h; y += 500) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
  }
  if (scrollTo) {
    await page.evaluate((s) => document.querySelector(s)?.scrollIntoView(), scrollTo);
    await page.waitForTimeout(wait);
  }
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full && !scrollTo });
  await page.close();
}
await shot("landing-top", "/", { full: false, wait: 3500 });
await shot("landing-full", "/");
await shot("landing-loop", "/", { full: false, scrollTo: "#loop", wait: 5200 });
await shot("landing-mobile", "/", { width: 390, height: 844, full: false, wait: 3000 });
await shot("dashboard", "/dashboard", { wait: 3000 });
await shot("lessons", "/lessons", { wait: 2500 });
await shot("runs", "/runs", { wait: 2500 });
console.log("ERRORS:", JSON.stringify(errors, null, 1));
await browser.close();

