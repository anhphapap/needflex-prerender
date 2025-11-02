import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

// Cache kết quả prerender để tăng tốc (RAM cache)
const cache = new Map();

app.get("*", async (req, res) => {
  try {
    const targetUrl = req.protocol + "://" + req.get("host") + req.originalUrl;

    // Domain thật của bạn — dùng để render
    const siteUrl = "https://needflex.site" + req.originalUrl;

    // Nếu trong cache rồi → trả luôn
    if (cache.has(siteUrl)) {
      console.log("Cache hit:", siteUrl);
      return res.send(cache.get(siteUrl));
    }

    console.log("Rendering:", siteUrl);
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(siteUrl, { waitUntil: "networkidle2", timeout: 60000 });

    const html = await page.content();
    await browser.close();

    cache.set(siteUrl, html);
    res.set("Cache-Control", "public, max-age=86400"); // cache 1 ngày
    res.send(html);
  } catch (err) {
    console.error("Error rendering:", err);
    res.status(500).send("Prerender error");
  }
});

app.listen(PORT, () => console.log(`✅ Prerender server running on ${PORT}`));
