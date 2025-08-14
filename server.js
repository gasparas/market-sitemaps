// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (e.g., XML) from /public
app.use("/public", express.static(path.join(__dirname, "public")));

// App Proxy endpoint Shopify will call
app.get("/proxy/sitemaps/:market.xml", (req, res) => {
  const { market } = req.params; // e.g., "austria"
  const filePath = path.join(__dirname, "public", "sitemaps", `${market}.xml`);
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(err.statusCode || 404).type("text/plain").send("Sitemap not found");
    }
  });
});

// Simple health check
app.get("/", (_req, res) => res.type("text/plain").send("OK"));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});