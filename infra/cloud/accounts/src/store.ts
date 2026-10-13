import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.ts";
export const openDb = (db: D1Database) => drizzle(db, { schema, casing: "snake_case" });
export type Db = ReturnType<typeof openDb>;
