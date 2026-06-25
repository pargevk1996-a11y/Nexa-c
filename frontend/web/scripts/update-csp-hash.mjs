#!/usr/bin/env node
/**
 * Post-build: extract sha256 hashes of every inline <script> from dist/index.html
 * and patch the script-src directive in infrastructure/nginx/conf.d/gateway.conf.
 *
 * Run automatically via npm postbuild hook; can also be run manually:
 *   node scripts/update-csp-hash.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dir, "..");
const PROJECT_ROOT = resolve(__dir, "../../..");
const DIST_HTML = resolve(WEB_ROOT, "dist/index.html");
const NGINX_CONF = resolve(PROJECT_ROOT, "infrastructure/nginx/conf.d/gateway.conf");

// --- 1. Read built index.html ---
let html;
try {
  html = readFileSync(DIST_HTML, "utf8");
} catch {
  console.error(`update-csp-hash: cannot read ${DIST_HTML} — run 'npm run build' first`);
  process.exit(1);
}

// --- 2. Extract inline executable scripts ---
// Match <script> with NO type attribute (or type="text/javascript").
// Skips: type="module" (external bundle), type="application/ld+json" (structured data).
const INLINE_RE = /<script\s*>([\s\S]*?)<\/script>/g;
const hashes = [];
let m;
while ((m = INLINE_RE.exec(html)) !== null) {
  const content = m[1];
  const hash = createHash("sha256").update(content, "utf8").digest("base64");
  hashes.push(`'sha256-${hash}'`);
}

if (hashes.length === 0) {
  console.log("update-csp-hash: no inline scripts found — gateway.conf unchanged");
  process.exit(0);
}

// --- 3. Patch script-src in gateway.conf ---
let conf;
try {
  conf = readFileSync(NGINX_CONF, "utf8");
} catch {
  console.error(`update-csp-hash: cannot read ${NGINX_CONF}`);
  process.exit(1);
}

// Replace existing script-src value (keeps 'self', replaces all sha256 tokens)
const newScriptSrc = `script-src 'self' ${hashes.join(" ")}`;
const SCRIPT_SRC_RE = /script-src 'self'(?:\s+'sha256-[A-Za-z0-9+/=]+')*(?:\s+'sha256-[A-Za-z0-9+/=]+')?/g;
const updated = conf.replace(SCRIPT_SRC_RE, newScriptSrc);

if (updated === conf) {
  // Two possible reasons: pattern not found, OR hashes were already correct (idempotent).
  const alreadyCorrect = hashes.every((h) => conf.includes(h));
  if (alreadyCorrect) {
    console.log("update-csp-hash: gateway.conf already up to date");
    process.exit(0);
  }
  console.error("update-csp-hash: script-src pattern not found in gateway.conf — check regex");
  process.exit(1);
}

writeFileSync(NGINX_CONF, updated, "utf8");

console.log(`update-csp-hash: patched ${NGINX_CONF}`);
hashes.forEach((h) => console.log(`  ${h}`));
