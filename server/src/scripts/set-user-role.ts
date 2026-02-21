import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { users } from "../db/schema.js";

type UserRole = "user" | "admin";

function readArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function parseRole(value: string | undefined): UserRole | null {
  if (value === "user" || value === "admin") return value;
  return null;
}

async function main() {
  const username = readArgValue("--username");
  const role = parseRole(readArgValue("--role"));

  if (!username || !role) {
    console.error("Usage: pnpm run user:role -- --username <name> --role <user|admin>");
    process.exit(1);
  }

  const target = await db.select().from(users).where(eq(users.username, username)).get();
  if (!target) {
    console.error(`User not found: ${username}`);
    process.exit(1);
  }

  await db
    .update(users)
    .set({
      role,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, target.id));

  console.log(`Updated role: ${username} -> ${role}`);
  console.log("If user is currently online, re-login or refresh token to apply new role.");
}

await main();
