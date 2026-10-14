import { expect, it } from "vite-plus/test";
import { mailSql } from "./storage.ts";
it("isolates SQL table/index names without changing message text or pragma metadata", () => {
  expect(mailSql("SELECT * FROM messages WHERE subject = 'messages and labels'")).toBe(
    "SELECT * FROM mail_messages WHERE subject = 'messages and labels'",
  );
  expect(mailSql("SELECT name FROM pragma_table_info('messages')")).toBe(
    "SELECT name FROM pragma_table_info('mail_messages')",
  );
});
