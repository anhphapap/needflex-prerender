import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 10000;

// Cache RAM
const cache = new Map();
const CACHE_TTL = 3600000; // 1 giờ

// ✅ Tự động tìm Chrome executable
async function getChromePath() {
  try {
    // Thử các path thường gặp trên Render
    const paths = [
      puppeteer.executablePath(),
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      process.env.PUPPETEER_EXECUTABLE_PATH,
    ].filter(Boolean);

    for (const path of paths) {
      try {
        const { execSync } = await import("child_process");
        execSync(`test -f ${path}`);
        console.log("✅ Found Chrome at:", path);
        return path;
      } catch (e) {
        continue;
      }
    }

    // Fallback
    return puppeteer.executablePath();
  } catch (error) {
    console.error("⚠️ Chrome path detection failed, using default");
    return puppeteer.executablePath();
  }
}

// ✅ HEAD request
app.head("*", (req, res) => {
  res.status(204).end();
});

// ✅ GET request
app.get("*", async (req, res) => {
  const siteUrl = "https://needflex.site" + req.originalUrl;
  console.log("🕷 Rendering:", siteUrl);

  // Check cache
  const cached = cache.get(siteUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log("⚡ Cache hit:", siteUrl);
    res.set("X-Cache", "HIT");
    return res.send(cached.html);
  }

  let browser;
  try {
    const chromePath = await getChromePath();

    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
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
        "--metrics-recording-only",
        "--mute-audio",
        "--no-first-run",
        "--safebrowsing-disable-auto-update",
        "--disable-features=site-per-process",
        "--single-process", // Quan trọng cho Render free tier
      ],
    });

    const page = await browser.newPage();

    // Giảm memory usage
    await page.setViewport({ width: 1280, height: 720 });

    // Set user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://google.com",
    });

    // Navigate
    await page.goto(siteUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Đợi body render
    await page.waitForSelector("body", { timeout: 10000 });

    const html = await page.content();
    await browser.close();
    browser = null;

    // Save cache
    cache.set(siteUrl, {
      html: html,
      timestamp: Date.now(),
    });

    // Cleanup old cache (giữ max 50 entries)
    if (cache.size > 50) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    res.set("Cache-Control", "public, max-age=3600");
    res.set("X-Cache", "MISS");
    res.send(html);
  } catch (err) {
    console.error("❌ Render error:", err.message);

    // Cleanup browser nếu còn
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error("Failed to close browser:", e.message);
      }
    }

    res.status(500).send("Prerender error: " + err.message);
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache_size: cache.size,
  });
});

app.listen(PORT, () => {
  console.log(`✅ Prerender server running on port ${PORT}`);
  getChromePath().then((path) => {
    console.log(`🌐 Chrome path: ${path}`);
  });
});

// Cleanup on exit
process.on("SIGTERM", () => {
  console.log("SIGTERM received, cleaning up...");
  cache.clear();
  process.exit(0);
});
