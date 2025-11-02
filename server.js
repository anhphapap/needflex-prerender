import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 10000;

// cache RAM để giảm tải (Render free chỉ có 512MB)
const cache = new Map();

// ✅ 1. Xử lý HEAD request (Google Search Console, bot test)
app.head("*", (req, res) => {
  res.status(200).send("OK");
});

// ✅ 2. Xử lý GET request (Googlebot, Facebook, Twitter, v.v.)
app.get("*", async (req, res) => {
  const siteUrl = "https://needflex.site" + req.originalUrl;
  console.log("🕷 Rendering:", siteUrl);

  // Nếu có trong cache rồi -> trả nhanh
  if (cache.has(siteUrl)) {
    console.log("⚡ Cache hit:", siteUrl);
    res.set("X-Cache", "HIT");
    return res.send(cache.get(siteUrl));
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: puppeteer.executablePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
      ],
    });

    const page = await browser.newPage();

    // giả user thật để Cloudflare không chặn
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://google.com",
    });

    // chờ trang load xong JS (React render)
    await page.goto(siteUrl, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector("body", { timeout: 20000 });

    const html = await page.content();
    await browser.close();

    // Lưu cache RAM (1 giờ)
    cache.set(siteUrl, html);
    res.set("Cache-Control", "public, max-age=3600");
    res.set("X-Cache", "MISS");
    res.send(html);
  } catch (err) {
    console.error("❌ Render error for:", siteUrl, err.message);
    res.status(500).send("Prerender error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Prerender server running on port ${PORT}`);
});
