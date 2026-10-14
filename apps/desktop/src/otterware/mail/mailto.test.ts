import { expect, it } from "vite-plus/test";
import { parseMailtoUrl, setPendingMailto, takePendingMailto } from "./mailto.ts";
it("preserves literal plus signs and decodes RFC 6068 fields", () => {
  expect(
    parseMailtoUrl(
      "mailto:a+tag@example.com?to=b%40example.com&cc=c+tag%40example.com&subject=A%20%26%20B&body=one%0Atwo",
    ),
  ).toEqual({
    to: "a+tag@example.com, b@example.com",
    cc: "c+tag@example.com",
    subject: "A & B",
    body: "one\ntwo",
  });
  expect(parseMailtoUrl("https://example.com")).toBeNull();
  expect(parseMailtoUrl("mailto:a%broken")).toMatchObject({ to: "a%broken" });
});
it("delivers a cold-start compose target once", () => {
  const target = parseMailtoUrl("mailto:a@example.com")!;
  setPendingMailto(target);
  expect(takePendingMailto()).toEqual(target);
  expect(takePendingMailto()).toBeNull();
});
