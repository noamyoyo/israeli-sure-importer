import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import logger from './logger';

// Sure-free pipeline: keep a verbatim, replayable copy of every scrape.
// Spec: ~/Projects/budget/docs/plans/2026-10-06-scraper-direct-read-path.md §3 (L0/L1), phase T0.
//
// FAIL CLOSED. If RAW_ARCHIVE_DIR is unset or not writable the run must not proceed: the archive
// was silently dead from 2026-09-25 to 2026-10-06 because this module used to no-op in that case.
// Files are timestamped and never overwritten, so a retry or manual re-run keeps every attempt.

const DIR = process.env.RAW_ARCHIVE_DIR;

function dayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
}

function timeHHMMSS(): string {
  return new Date().toLocaleTimeString('sv-SE', { timeZone: 'Asia/Jerusalem' }).replace(/:/g, '');
}

// One id and one day folder per process run, shared by every file of that run. The day is captured
// once so a run that crosses midnight keeps all its files (and its manifest) in the same folder.
// The pid suffix keeps two processes that start in the same second (scheduled run + manual exec)
// from colliding on the 'wx' open.
// The per-process sequence number does the same for two runs inside one process in one second.
let runSeq = 0;
let runDay = dayISO();
let runId = `${timeHHMMSS()}-${process.pid}-${++runSeq}`;

/** Start a new run: new id/day, so two runs on the same day never overwrite each other. */
export function beginArchiveRun(): string {
  runDay = dayISO();
  runId = `${timeHHMMSS()}-${process.pid}-${++runSeq}`;
  return runId;
}

function dayDir(): string {
  if (!DIR) throw new Error('RAW_ARCHIVE_DIR is not set');
  const dir = path.join(DIR, runDay);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Throws unless the archive directory is configured and writable (probes with a real write).
 * Call at the start of every run, before any scraping or Sure write.
 */
export function assertArchiveReady(): void {
  if (!DIR) throw new Error('RAW_ARCHIVE_DIR is not set — refusing to run without the raw archive');
  // Sentinel: proves the real archive volume is mounted. If a redeploy keeps the env var but drops
  // the bind mount, mkdir(recursive) would silently write into the container layer instead.
  if (!fs.existsSync(path.join(DIR, '.archive-root'))) {
    throw new Error(`RAW_ARCHIVE_DIR (${DIR}) has no .archive-root sentinel — volume not mounted?`);
  }
  try {
    const probe = path.join(dayDir(), `.probe-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
  } catch (err) {
    throw new Error(`RAW_ARCHIVE_DIR (${DIR}) is not writable: ${String(err)}`);
  }
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * Dump one target's raw scraper result (accounts[] with balance + txns[]) exactly as
 * israeli-bank-scrapers returned it — before any filter, dedup or transform. Writes
 * `<dir>/<date>/<runId>-<target>.json`, never overwriting. THROWS on failure (the caller marks
 * the target failed) — a scrape that cannot be archived must not look successful.
 */
export function archiveScrape(targetName: string, companyId: string, accounts: unknown): void {
  const body = JSON.stringify(
    { scrapedAt: new Date().toISOString(), runId, target: targetName, companyId, accounts },
    null,
    2,
  );
  const file = path.join(dayDir(), `${runId}-${safeName(targetName)}.json`);
  fs.writeFileSync(file, body, { flag: 'wx' }); // 'wx': fail if it already exists — never overwrite
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

export interface RuntimeVersions {
  importerGitSha: string;
  scraperVersion: string;
  patchApplied: boolean;
  node: string;
  chromium: string;
}

let cachedVersions: RuntimeVersions | null = null;

/** Versions that make the pin observable. Cached per process; every field degrades to 'unknown'. */
export function runtimeVersions(): RuntimeVersions {
  if (cachedVersions) return cachedVersions;
  let scraperVersion = 'unknown';
  let patchApplied = false;
  try {
    const pkgPath = require.resolve('israeli-bank-scrapers/package.json');
    scraperVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? 'unknown';
    // Marker string that only exists once our patch-package patch is applied (max.js unknown-type fix).
    const maxJs = fs.readFileSync(path.join(path.dirname(pkgPath), 'lib', 'scrapers', 'max.js'), 'utf8');
    patchApplied = maxJs.includes('treating as Normal');
  } catch (err) {
    logger.warn(`runtimeVersions: could not read scraper version/patch marker: ${String(err)}`);
  }
  let chromium = 'unknown';
  try {
    chromium = execFileSync(process.env.PUPPETEER_EXECUTABLE_PATH || 'chromium', ['--version'], {
      timeout: 5000,
      encoding: 'utf8',
    }).trim();
  } catch {
    /* leave 'unknown' */
  }
  cachedVersions = {
    importerGitSha: process.env.IMPORTER_GIT_SHA || 'unknown',
    scraperVersion,
    patchApplied,
    node: process.version,
    chromium,
  };
  return cachedVersions;
}

/**
 * Write the per-run manifest `<dir>/<date>/<runId>-manifest.json` (which targets scraped OK,
 * timings, balances, runtime versions). Never overwrites. THROWS on failure.
 * Consumers: ingest.py and check_archive.py — an ok:false target is recorded stale, never skipped.
 */
export function writeManifest(targets: ManifestTarget[]): void {
  const file = path.join(dayDir(), `${runId}-manifest.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      { schemaVersion: 1, runId, runAt: new Date().toISOString(), versions: runtimeVersions(), targets },
      null,
      2,
    ),
    { flag: 'wx' },
  );
}
