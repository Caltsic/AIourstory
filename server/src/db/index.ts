import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { config } from "../config.js";
import * as schema from "./schema.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const isFileDatabase = config.databaseUrl.startsWith("file:");

if (isFileDatabase) {
  const dbPath = config.databaseUrl.slice("file:".length);
  mkdirSync(dirname(dbPath), { recursive: true });
}

const client = createClient({
  url: config.databaseUrl,
});

if (isFileDatabase) {
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute("PRAGMA busy_timeout = 5000");
}

export const db = drizzle(client, { schema });
export { client };
