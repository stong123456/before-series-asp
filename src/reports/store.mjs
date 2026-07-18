import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const REPORT_FILE_SUFFIX = ".report";
const MAX_REPORT_FILE_BYTES = 512 * 1024;

export async function createReportStore(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const ttlMs = boundedInteger(options.ttlMs ?? hoursToMs(process.env.REPORT_TTL_HOURS), 60_000, 7 * 24 * 60 * 60 * 1000, 24 * 60 * 60 * 1000);
  const maxEntries = boundedInteger(options.maxEntries ?? process.env.REPORT_MAX_ENTRIES, 10, 10_000, 2_000);

  if (!production) return createMemoryStore({ ttlMs, maxEntries, now: options.now });

  const directory = String(options.directory || process.env.REPORT_STORAGE_DIR || "").trim();
  if (!directory || !isAbsolute(directory)) throw new Error("REPORT_STORAGE_DIR must be an absolute directory in production.");
  const key = parseEncryptionKey(options.encryptionKey || process.env.REPORT_ENCRYPTION_KEY);
  await mkdir(directory, { recursive: true });
  return createEncryptedFileStore({ directory, key, ttlMs, maxEntries, now: options.now });
}

function createMemoryStore({ ttlMs, maxEntries, now = () => Date.now() }) {
  const records = new Map();
  return {
    mode: "memory",
    ttlMs,
    async create(payload) {
      sweepMemory(records, now());
      while (records.size >= maxEntries) records.delete(records.keys().next().value);
      const record = createRecord(payload, ttlMs, now());
      records.set(record.id, record);
      return publicRecordMetadata(record);
    },
    async get(id) {
      if (!validReportId(id)) return null;
      const record = records.get(id);
      if (!record) return null;
      if (record.expiresAtMs <= now()) {
        records.delete(id);
        return null;
      }
      return structuredClone(record);
    }
  };
}

function createEncryptedFileStore({ directory, key, ttlMs, maxEntries, now = () => Date.now() }) {
  let lastSweep = 0;
  return {
    mode: "encrypted_file",
    ttlMs,
    async create(payload) {
      if (now() - lastSweep > Math.min(ttlMs, 60 * 60 * 1000)) {
        await sweepFiles(directory, ttlMs, maxEntries, now());
        lastSweep = now();
      }
      const record = createRecord(payload, ttlMs, now());
      const envelope = encryptRecord(record, key);
      const destination = reportPath(directory, record.id);
      const temporary = `${destination}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(temporary, JSON.stringify(envelope), { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
      return publicRecordMetadata(record);
    },
    async get(id) {
      if (!validReportId(id)) return null;
      const path = reportPath(directory, id);
      try {
        const info = await stat(path);
        if (!info.isFile() || info.size > MAX_REPORT_FILE_BYTES) return null;
        const envelope = JSON.parse(await readFile(path, "utf8"));
        const record = decryptRecord(envelope, key, id);
        if (record.id !== id || record.expiresAtMs <= now()) {
          await rm(path, { force: true });
          return null;
        }
        return record;
      } catch {
        return null;
      }
    }
  };
}

function createRecord(payload, ttlMs, nowMs) {
  const id = randomBytes(24).toString("base64url");
  return {
    id,
    createdAt: new Date(nowMs).toISOString(),
    createdAtMs: nowMs,
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    expiresAtMs: nowMs + ttlMs,
    payload: structuredClone(payload)
  };
}

function publicRecordMetadata(record) {
  return { id: record.id, createdAt: record.createdAt, expiresAt: record.expiresAt };
}

function encryptRecord(record, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(record.id, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(record), "utf8"), cipher.final()]);
  return {
    version: 1,
    id: record.id,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

function decryptRecord(envelope, key, expectedId) {
  if (envelope?.version !== 1 || envelope?.id !== expectedId) throw new Error("Invalid report envelope.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
  decipher.setAAD(Buffer.from(expectedId, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

async function sweepFiles(directory, ttlMs, maxEntries, nowMs) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(REPORT_FILE_SUFFIX));
  const entries = [];
  for (const name of names) {
    const path = join(directory, name);
    try {
      const info = await stat(path);
      if (!info.isFile() || nowMs - info.mtimeMs > ttlMs * 2) await rm(path, { force: true });
      else entries.push({ path, mtimeMs: info.mtimeMs });
    } catch {
      // A concurrent cleanup or write can remove a candidate between listing and stat.
    }
  }
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const entry of entries.slice(0, Math.max(0, entries.length - maxEntries + 1))) {
    await rm(entry.path, { force: true });
  }
}

function sweepMemory(records, nowMs) {
  for (const [id, record] of records) {
    if (record.expiresAtMs <= nowMs) records.delete(id);
  }
}

function parseEncryptionKey(value) {
  const raw = String(value || "").trim();
  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else {
    try {
      key = Buffer.from(raw, "base64");
    } catch {
      key = Buffer.alloc(0);
    }
  }
  if (key.length !== 32) throw new Error("REPORT_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

function validReportId(value) {
  return /^[A-Za-z0-9_-]{32}$/.test(String(value || ""));
}

function reportPath(directory, id) {
  return join(directory, `${id}${REPORT_FILE_SUFFIX}`);
}

function hoursToMs(value) {
  const hours = Number(value);
  return Number.isFinite(hours) ? hours * 60 * 60 * 1000 : undefined;
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
