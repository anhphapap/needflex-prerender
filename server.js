import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

// Cache (RAM)
const cache = new Map();

app.get("*", async (req, res) => {
  const siteUrl = "https://needflex.site" + req.originalUrl;

  // Nếu đã cache rồi → trả nhanh
  if (cache.has(siteUrl)) {
    console.log("⚡ Cache hit:", siteUrl);
    return res.send(cache.get(siteUrl));
  }

  console.log("🕷️ Rendering:", siteUrl);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    // Load trang Needflex (chờ JS xong)
    await page.goto(siteUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Chờ body render xong
    await page.waitForSelector("body", { timeout: 10000 });

    const html = await page.content();
    await browser.close();

    cache.set(siteUrl, html);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(html);
  } catch (err) {
    console.error("❌ Render error for:", siteUrl, err.message);
    res.status(500).send("Prerender error");
  }
});

app.listen(PORT, () =>
  console.log(`✅ Prerender server running on port ${PORT}`)
);
