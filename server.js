// server.js (ESM)
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: Set this in your Render environment variables
const SHOPIFY_APP_SECRET = process.env.SHOPIFY_APP_SECRET;

// Serve anything under /public directly (handy for testing)
app.use("/public", express.static(path.join(__dirname, "public")));

// Helper to verify Shopify app proxy signature
function verifyShopifySignature(query) {
  if (!SHOPIFY_APP_SECRET) {
    console.error("SHOPIFY_APP_SECRET is not set!");
    return false;
  }

  const { signature, ...params } = query;
  
  if (!signature) {
    console.log("No signature provided");
    return false;
  }

  // Sort parameters and create query string
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('');

  // Calculate HMAC
  const calculatedSignature = crypto
    .createHmac('sha256', SHOPIFY_APP_SECRET)
    .update(sortedParams)
    .digest('hex');

  const isValid = calculatedSignature === signature;
  
  if (!isValid) {
    console.log("Signature verification failed");
    console.log("Expected:", calculatedSignature);
    console.log("Received:", signature);
  }
  
  return isValid;
}

// Helper to send XML with correct headers
async function sendXml(res, filePath) {
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  
  try {
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    res.send(xmlContent);
  } catch (err) {
    console.error("Error reading file:", err);
    res.status(404).type("text/plain").send("Sitemap not found");
  }
}

// ✅ Shopify App Proxy target
// Works for both /proxy/sitemaps/austria and /proxy/sitemaps/austria.xml
app.get(["/proxy/sitemaps/:market", "/proxy/sitemaps/:market.xml"], async (req, res) => {
  console.log("Proxy request received:");
  console.log("  Path:", req.path);
  console.log("  Market:", req.params.market);
  console.log("  Query:", req.query);
  
  try {
    // For development/testing, you might want to skip verification
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Verify the request is from Shopify (skip in development if needed)
    if (!isDevelopment && !verifyShopifySignature(req.query)) {
      console.error("Invalid signature - request rejected");
      return res.status(403).type("text/plain").send("Forbidden");
    }
    
    const market = (req.params.market || "").toLowerCase().replace('.xml', '');
    if (!market) {
      return res.status(400).type("text/plain").send("Market is required");
    }

    const fileName = `${market}.xml`;
    const filePath = path.join(__dirname, "public", "sitemaps", fileName);
    
    console.log("Looking for file:", filePath);

    // Check if file exists
    try {
      await fs.access(filePath);
      console.log("File found, sending XML");
      await sendXml(res, filePath);
    } catch {
      console.error("File not found:", filePath);
      
      // List available files for debugging
      const sitemapsDir = path.join(__dirname, "public", "sitemaps");
      try {
        const files = await fs.readdir(sitemapsDir);
        console.log("Available sitemap files:", files);
      } catch (e) {
        console.error("Cannot read sitemaps directory:", e);
      }
      
      res.status(404).type("text/plain").send(`Sitemap not found for market: ${market}`);
    }
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).type("text/plain").send("Internal server error");
  }
});

// Test endpoint to verify server is running and list available sitemaps
app.get("/test", async (_req, res) => {
  try {
    const sitemapsDir = path.join(__dirname, "public", "sitemaps");
    const files = await fs.readdir(sitemapsDir);
    res.json({
      status: "Server is running",
      availableSitemaps: files,
      environment: {
        hasSecret: !!SHOPIFY_APP_SECRET,
        nodeEnv: process.env.NODE_ENV
      }
    });
  } catch (error) {
    res.json({
      status: "Server is running",
      error: "Cannot read sitemaps directory"
    });
  }
});

// Simple health checks
app.get("/", (_req, res) => res.type("text/plain").send("Shopify Sitemap Proxy Server"));
app.get("/healthz", (_req, res) => res.type("text/plain").send("OK"));

// Direct access to sitemaps (for testing without proxy)
app.get("/sitemaps/:market.xml", async (req, res) => {
  console.log("Direct sitemap access:", req.params.market);
  const market = req.params.market.toLowerCase();
  const filePath = path.join(__dirname, "public", "sitemaps", `${market}.xml`);
  
  try {
    await fs.access(filePath);
    await sendXml(res, filePath);
  } catch {
    res.status(404).type("text/plain").send("Sitemap not found");
  }
});

// Catch-all 404
app.use((_req, res) => res.status(404).type("text/plain").send("Not found"));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`App secret configured: ${!!SHOPIFY_APP_SECRET}`);
});
