import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 10000;

// Cache RAM
const cache = new Map();
const CACHE_TTL = 3600000; // 1 giờ

// ✅ HEAD request
app.head("*", (_, res) => res.status(204).end());

// ✅ GET request
app.get("*", async (req, res) => {
  const siteUrl = "https://needflex.site" + req.originalUrl;
  console.log("🕷 Rendering:", siteUrl);

  // Cache hit
  const cached = cache.get(siteUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log("⚡ Cache hit:", siteUrl);
    res.set("X-Cache", "HIT");
    return res.send(cached.html);
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--mute-audio",
        "--single-process",
      ],
    });

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    await page.goto(siteUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    await page.waitForSelector("body", { timeout: 10000 });
    const html = await page.content();

    await browser.close();
    browser = null;

    // Cache lại
    cache.set(siteUrl, { html, timestamp: Date.now() });
    if (cache.size > 50) cache.delete(cache.keys().next().value);

    res.set("Cache-Control", "public, max-age=3600");
    res.set("X-Cache", "MISS");
    res.send(html);
  } catch (err) {
    console.error("❌ Render error:", err.message);
    if (browser) await browser.close().catch(() => {});
    res.status(500).send("Prerender error: " + err.message);
  }
});

// ✅ Health check
app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache_size: cache.size,
  });
});

app.listen(PORT, () => {
  console.log(`✅ Playwright prerender server running on port ${PORT}`);
});

// Cleanup on exit
process.on("SIGTERM", () => {
  console.log("SIGTERM received, cleaning up...");
  cache.clear();
  process.exit(0);
});
