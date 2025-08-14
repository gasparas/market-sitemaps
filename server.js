// server.js - Simplified for App Proxy only
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Get this from Shopify Partners Dashboard → Your App → API Credentials
const SHOPIFY_APP_SECRET = process.env.SHOPIFY_APP_SECRET;

// Logging middleware for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (Object.keys(req.query).length > 0) {
    console.log("Query params:", req.query);
  }
  next();
});

// Verify Shopify proxy signature
function verifyProxySignature(query) {
  const { signature, ...params } = query;
  
  if (!signature) {
    console.log("⚠️  No signature in request");
    return false;
  }

  if (!SHOPIFY_APP_SECRET) {
    console.error("❌ SHOPIFY_APP_SECRET not configured!");
    return false;
  }

  // Create sorted param string
  const message = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('');

  // Calculate HMAC
  const calculated = crypto
    .createHmac('sha256', SHOPIFY_APP_SECRET)
    .update(message)
    .digest('hex');

  const valid = calculated === signature;
  
  if (!valid) {
    console.log("❌ Signature mismatch!");
    console.log("  Expected:", calculated);
    console.log("  Received:", signature);
  } else {
    console.log("✅ Signature valid");
  }
  
  return valid;
}

// Main proxy endpoint - this is what Shopify calls
app.get("/proxy/sitemaps/:market", async (req, res) => {
  console.log("\n📥 Proxy request for market:", req.params.market);
  
  // For initial testing, you can temporarily skip verification
  const skipVerification = process.env.SKIP_VERIFICATION === 'true';
  
  if (!skipVerification) {
    if (!verifyProxySignature(req.query)) {
      console.log("❌ Request rejected - invalid signature");
      return res.status(403).send("Forbidden");
    }
  } else {
    console.log("⚠️  Signature verification skipped (testing mode)");
  }

  try {
    const market = req.params.market.toLowerCase().replace('.xml', '');
    const filePath = path.join(__dirname, "public", "sitemaps", `${market}.xml`);
    
    console.log("📁 Looking for file:", filePath);
    
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    
    console.log("✅ Sending XML for market:", market);
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.send(xmlContent);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(404).send(`Sitemap not found for market: ${req.params.market}`);
  }
});

// Test endpoint - visit this first to verify deployment
app.get("/test", async (req, res) => {
  const sitemapsDir = path.join(__dirname, "public", "sitemaps");
  
  try {
    const files = await fs.readdir(sitemapsDir);
    
    res.json({
      status: "✅ Server running",
      timestamp: new Date().toISOString(),
      environment: {
        secretConfigured: !!SHOPIFY_APP_SECRET,
        skipVerification: process.env.SKIP_VERIFICATION === 'true',
        nodeEnv: process.env.NODE_ENV || 'not set'
      },
      availableSitemaps: files,
      expectedProxyUrl: "https://your-store.myshopify.com/apps/sitemaps/[market].xml",
      serverEndpoint: "/proxy/sitemaps/[market]"
    });
  } catch (error) {
    res.json({
      status: "⚠️ Server running but cannot read sitemaps",
      error: error.message
    });
  }
});

// Direct access for testing (bypasses signature check)
app.get("/direct/:market.xml", async (req, res) => {
  console.log("Direct access test for:", req.params.market);
  
  try {
    const filePath = path.join(__dirname, "public", "sitemaps", `${req.params.market}.xml`);
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    
    res.set("Content-Type", "application/xml");
    res.send(xmlContent);
  } catch (error) {
    res.status(404).send("Not found");
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("Shopify Sitemap Proxy Server - Visit /test for status");
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server started on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`🔑 Secret configured: ${!!SHOPIFY_APP_SECRET}`);
  console.log(`\n👉 Visit /test endpoint to verify setup`);
});
