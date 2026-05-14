import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createDynamoRepositories } from "./dynamo/dynamoRepositories.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function createRepositories() {
  const backend = (process.env.DATA_BACKEND || "sqlite").toLowerCase();
  if (backend === "dynamo") {
    return createDynamoRepositories();
  }
  const [{ openSqliteDb }, { createSqliteRepositories }] = await Promise.all([
    import("../sqlite/openSqliteDb.js"),
    import("./sqlite/sqliteRepositories.js")
  ]);
  const dbPath = process.env.SQLITE_PATH || join(__dirname, "..", "shadowing.db");
  const db = await openSqliteDb(dbPath);
  return createSqliteRepositories(db);
}
