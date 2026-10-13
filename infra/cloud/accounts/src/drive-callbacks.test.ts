import * as NodeFS from "node:fs";
const { readFileSync, readdirSync } = NodeFS;
import * as NodeSqlite from "node:sqlite";
const { DatabaseSync } = NodeSqlite;
import { expect, it } from "vite-plus/test";

it("adds standalone callbacks without replacing old clients or operator-added redirects", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const migrations = new URL("../migrations/", import.meta.url);
    for (const file of readdirSync(migrations).sort()) {
      if (file === "0006_drive_web_callbacks.sql") break;
      db.exec(readFileSync(new URL(file, migrations), "utf8"));
    }
    db.exec(
      `UPDATE oauth_client SET redirect_uris = json_insert(redirect_uris, '$[#]', 'https://custom.example/account/callback') WHERE client_id = 'otter-code-web'`,
    );
    const before = db
      .prepare("SELECT * FROM oauth_client WHERE client_id != 'otter-code-web' ORDER BY id")
      .all();
    const migration = readFileSync(new URL("0006_drive_web_callbacks.sql", migrations), "utf8");
    db.exec(migration);
    db.exec(migration);
    const web = db
      .prepare("SELECT redirect_uris FROM oauth_client WHERE client_id = 'otter-code-web'")
      .get()!;
    expect(JSON.parse(String(web.redirect_uris))).toEqual([
      "https://code.otterware.app/account/callback",
      "https://custom.example/account/callback",
      "https://drive.otterware.app/account/callback",
      "https://cloud.otterware.app/account/callback",
    ]);
    expect(
      db
        .prepare("SELECT * FROM oauth_client WHERE client_id != 'otter-code-web' ORDER BY id")
        .all(),
    ).toEqual(before);
  } finally {
    db.close();
  }
});
