// server.js (ESM)
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve anything under /public directly (handy for testing)
app.use("/public", express.static(path.join(__dirname, "public")));

// Helper to send XML with correct headers
async function sendXml(res, filePath) {
  res.set("Content-Type", "application/xml; charset=utf-8");
  // 1 hour cache; adjust if you want
  res.set("Cache-Control", "public, max-age=3600");
  res.sendFile(filePath, (err) => {
    if (err) {
      res
        .status(err.statusCode || 404)
        .type("text/plain")
        .send("Sitemap not found");
    }
  });
}

// ✅ Shopify App Proxy target
// Works for both /proxy/sitemaps/austria and /proxy/sitemaps/austria.xml
app.get(["/proxy/sitemaps/:market", "/proxy/sitemaps/:market.xml"], async (req, res) => {
  try {
    const market = (req.params.market || "").toLowerCase(); // e.g., "austria"
    if (!market) {
      return res.status(400).type("text/plain").send("Market is required");
    }

    const fileName = market.endsWith(".xml") ? market : `${market}.xml`;
    const filePath = path.join(__dirname, "public", "sitemaps", fileName);

    // Ensure file exists before trying to send
    await fs.access(filePath);
    await sendXml(res, filePath);
  } catch {
    res.status(404).type("text/plain").send("Sitemap not found");
  }
});

// Simple health checks
app.get("/", (_req, res) => res.type("text/plain").send("OK"));
app.get("/healthz", (_req, res) => res.type("text/plain").send("OK"));

// Catch-all 404 (text, not HTML)
app.use((_req, res) => res.status(404).type("text/plain").send("Not found"));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
