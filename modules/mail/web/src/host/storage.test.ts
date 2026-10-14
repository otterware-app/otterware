// @vitest-environment jsdom
import { beforeEach, expect, it } from "vite-plus/test";
import { storageFor } from "./storage";
beforeEach(() => localStorage.clear());
it("isolates Mail's preferences from the host and from other environments", () => {
  localStorage.setItem("otter:theme:dark", "host-theme");
  storageFor("work").setItem("otter:theme:dark", "work-mail");
  storageFor("personal").setItem("otter:theme:dark", "personal-mail");
  expect(storageFor("work").getItem("otter:theme:dark")).toBe("work-mail");
  expect(storageFor("personal").getItem("otter:theme:dark")).toBe("personal-mail");
  expect(localStorage.getItem("otter:theme:dark")).toBe("host-theme");
  storageFor("work").removeItem("otter:theme:dark");
  expect(storageFor("personal").getItem("otter:theme:dark")).toBe("personal-mail");
});
