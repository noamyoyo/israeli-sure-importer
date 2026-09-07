import fs from 'fs';
import path from 'path';
import logger from './logger';

// Sure-free pipeline (P0): keep a verbatim, replayable copy of every scrape.
// Off unless RAW_ARCHIVE_DIR is set, so a plain rebuild changes nothing.
// Plan: ~/Projects/budget/docs/plans/2026-09-07-P0-raw-archive.md Part A/B.

const DIR = process.env.RAW_ARCHIVE_DIR;

function dayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
}

function ensureDir(): string {
  const dir = path.join(DIR as string, dayISO());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Dump one target's raw scraper result (accounts[] with balance + txns[]) exactly as
 * israeli-bank-scrapers returned it — before any filter, dedup or transform. No-op unless
 * RAW_ARCHIVE_DIR is set. Never throws: a write failure is logged and the run continues
 * (the archive is a parallel output, not on the Sure path).
 */
export function archiveScrape(targetName: string, companyId: string, accounts: unknown): void {
  if (!DIR) return;
  try {
    const body = JSON.stringify(
      { scrapedAt: new Date().toISOString(), target: targetName, companyId, accounts },
      null,
      2,
    );
    fs.writeFileSync(path.join(ensureDir(), `${targetName}.json`), body);
  } catch (err) {
    logger.warn(`[${targetName}] raw archive write failed: ${String(err)}`);
  }
}

export interface ManifestTarget {
  name: string;
  ok: boolean;
  error?: string;
  seconds?: number;
  scraped?: number;
  newTx?: number;
  balances?: Record<string, number | null>;
}

/**
 * Write the per-run manifest (which targets scraped OK, timings, balances). ingest.py reads
 * this first: a target with ok:false is recorded stale, never silently skipped. No-op unless
 * RAW_ARCHIVE_DIR is set; never throws.
 */
export function writeManifest(targets: ManifestTarget[]): void {
  if (!DIR) return;
  try {
    fs.writeFileSync(
      path.join(ensureDir(), 'manifest.json'),
      JSON.stringify({ runAt: new Date().toISOString(), targets }, null, 2),
    );
  } catch (err) {
    logger.warn(`raw manifest write failed: ${String(err)}`);
  }
}
