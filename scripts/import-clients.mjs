// Run with: node scripts/import-clients.mjs
//
// Before running, install the one-off dependencies:
//   npm install --save-dev dotenv csv-parse
//
// Place the Acuity CSV export at scripts/acuity-clients.csv before running.
// Expected Acuity column headers (adjust MAP below if your export differs):
//   "First Name", "Last Name", "Email", "Phone"

import { createReadStream } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// ── Bootstrap ──────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local from project root
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.\n" +
    "    Make sure .env.local exists at the project root."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CSV_PATH = resolve(__dirname, "acuity-clients.csv");

// ── Column name mapping ───────────────────────────────────────────────────
// Adjust these keys if your Acuity export uses different header names.
const MAP = {
  firstName: "First Name",
  lastName:  "Last Name",
  email:     "Email",
  phone:     "Phone",
};

// ── Mobile normalisation ──────────────────────────────────────────────────
// Mirrors the normaliseMobile() function used in the booking system.
// Returns "+61XXXXXXXXX" for valid Australian mobiles, or null otherwise.
function normaliseMobile(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  // Already in 61XXXXXXXXX form (11 digits starting with 61)
  if (digits.startsWith("61") && digits.length === 11) return `+${digits}`;
  // Local 04XXXXXXXX form (10 digits starting with 0)
  if (digits.startsWith("0") && digits.length === 10) return `+61${digits.slice(1)}`;
  // 04XXXXXXXX without leading 0 (9 digits starting with 4) — Acuity sometimes strips the 0
  if (digits.startsWith("4") && digits.length === 9) return `+61${digits}`;
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📂  Reading ${CSV_PATH}`);

  // Collect all parsed rows first, then batch-process
  const rows = await new Promise((resolve, reject) => {
    const records = [];
    createReadStream(CSV_PATH)
      .pipe(
        parse({
          columns: true,       // Use first row as header keys
          skip_empty_lines: true,
          trim: true,
        })
      )
      .on("data", (row) => records.push(row))
      .on("end",  ()    => resolve(records))
      .on("error", reject);
  });

  console.log(`📋  ${rows.length} row(s) found in CSV\n`);

  let processed = 0;
  let inserted  = 0;
  let skipped   = 0;
  let invalid   = 0;

  for (const row of rows) {
    processed++;

    const firstName = (row[MAP.firstName] ?? "").trim();
    const lastName  = (row[MAP.lastName]  ?? "").trim();
    const email     = (row[MAP.email]     ?? "").trim().toLowerCase();
    const rawPhone  = (row[MAP.phone]     ?? "").trim();

    // Skip rows without a usable email
    if (!email || !email.includes("@")) {
      console.warn(`  ⚠️   Row ${processed}: no valid email — skipped (name: ${firstName} ${lastName})`);
      invalid++;
      continue;
    }

    const mobile = normaliseMobile(rawPhone);
    if (rawPhone && !mobile) {
      console.warn(`  ⚠️   Row ${processed}: could not normalise phone "${rawPhone}" for ${email} — importing without mobile`);
    }

    // Check whether this email already exists (case-insensitive via ilike)
    const { data: existing, error: lookupErr } = await supabase
      .from("clients")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (lookupErr) {
      console.error(`  ❌  Row ${processed}: lookup failed for ${email}:`, lookupErr.message);
      invalid++;
      continue;
    }

    if (existing) {
      console.log(`  ↩️   Row ${processed}: ${email} — already exists, skipped`);
      skipped++;
      continue;
    }

    // Insert new client
    const { error: insertErr } = await supabase
      .from("clients")
      .insert({
        first_name:    firstName || "Unknown",
        last_name:     lastName  || "",
        email,
        mobile:        mobile ?? null,
        is_new_client: false,
        notes:         null,
      });

    if (insertErr) {
      console.error(`  ❌  Row ${processed}: insert failed for ${email}:`, insertErr.message);
      invalid++;
    } else {
      console.log(`  ✅  Row ${processed}: inserted ${firstName} ${lastName} <${email}>${mobile ? "" : " (no mobile)"}`);
      inserted++;
    }
  }

  console.log(`
──────────────────────────────────────
  Processed : ${processed}
  Inserted  : ${inserted}
  Skipped   : ${skipped}  (already in DB)
  Errors    : ${invalid}
──────────────────────────────────────
`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
