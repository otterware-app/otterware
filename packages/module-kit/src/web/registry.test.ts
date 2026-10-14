import { HouseIcon, MailIcon } from "lucide-react";
import { lazy } from "react";
import { describe, expect, it } from "vite-plus/test";

import { createModuleRegistry, defineWebModule } from "./registry.ts";

const page = lazy(() => Promise.resolve({ default: () => null }));

const home = defineWebModule({
  id: "home",
  label: "Home",
  icon: HouseIcon,
  rail: { position: "start", order: 0 },
  page,
  settings: null,
  commands: [],
  searchTerms: ["home"],
  serverModule: "home",
  sideChat: false,
});
const mail = defineWebModule({
  id: "mail",
  label: "Mail",
  icon: MailIcon,
  rail: { position: "end", order: 10 },
  page,
  settings: { label: "Mail", icon: MailIcon, searchTerms: ["mail"], component: page },
  commands: [],
  searchTerms: ["mail"],
  serverModule: "mail",
  sideChat: true,
});

describe("createModuleRegistry", () => {
  it("resolves module pages by path, including sub-pages", () => {
    const registry = createModuleRegistry([mail, home]);
    expect(registry.forPath("/home")).toEqual({ module: home, subpath: "" });
    expect(registry.forPath("/home/projects/p1")).toEqual({ module: home, subpath: "projects/p1" });
    expect(registry.forPath("/settings/mail")).toBeNull();
    expect(registry.isModulePath("/usage")).toBe(false);
    expect(registry.rail("start").map((module) => module.id)).toEqual(["home"]);
    expect(registry.settings.map((module) => module.id)).toEqual(["mail"]);
    expect(registry.threadAccessories).toEqual([]);
  });

  it("lists the modules that show something on Code threads", () => {
    const drive = defineWebModule({ ...mail, id: "drive", threadAccessory: page });
    const registry = createModuleRegistry([home, mail, drive]);
    expect(registry.threadAccessories.map((module) => module.id)).toEqual(["drive"]);
  });
});
