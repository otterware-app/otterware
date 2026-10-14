import { HouseIcon, MailIcon } from "lucide-react";
import { lazy } from "react";
import { describe, expect, it } from "vite-plus/test";

import { createModuleRegistry, defineWebModule, projectScopedModulePath } from "./registry.ts";

const page = lazy(() => Promise.resolve({ default: () => null }));

const home = defineWebModule({
  id: "home",
  label: "Home",
  icon: HouseIcon,
  page,
  settings: [],
  commands: [],
  searchTerms: ["home"],
  serverModule: "home",
  sideChat: false,
});
const mail = defineWebModule({
  id: "mail",
  label: "Mail",
  icon: MailIcon,
  page,
  settings: [
    {
      id: "reading",
      label: "Reading",
      icon: MailIcon,
      searchTerms: ["mail"],
      component: page,
      placement: { grouped: "page", standalone: "appearance" },
    },
  ],
  commands: [],
  searchTerms: ["mail"],
  serverModule: "mail",
  sideChat: true,
});

describe("createModuleRegistry", () => {
  it("resolves module pages by path, including sub-pages and project scope", () => {
    const registry = createModuleRegistry([mail, home]);
    expect(registry.forPath("/home")).toEqual({ module: home, subpath: "", projectId: null });
    expect(registry.forPath("/home/projects/p1")).toEqual({
      module: home,
      subpath: "projects/p1",
      projectId: null,
    });
    expect(registry.forPath(projectScopedModulePath("p1", "mail", "INBOX/m1"))).toEqual({
      module: mail,
      subpath: "INBOX/m1",
      projectId: "p1",
    });
    expect(registry.forPath("/home/projects/p1/drive")?.module).toBe(home);
    expect(registry.forPath("/settings/mail/reading")).toBeNull();
    expect(registry.isModulePath("/usage")).toBe(false);
  });
});
