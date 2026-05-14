import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createDynamoRepositories } from "./dynamo/dynamoRepositories.js";
import { createSqliteRepositories } from "./sqlite/sqliteRepositories.js";
import { openSqliteDb } from "../sqlite/openSqliteDb.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function createRepositories() {
  const backend = (process.env.DATA_BACKEND || "sqlite").toLowerCase();
  if (backend === "dynamo") {
    return createDynamoRepositories();
  }
  const dbPath = process.env.SQLITE_PATH || join(__dirname, "..", "shadowing.db");
  const db = await openSqliteDb(dbPath);
  return createSqliteRepositories(db);
}
