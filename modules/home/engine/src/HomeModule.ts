/**
 * Home: the day across every installed module. Owns the overview that merges
 * every contributor, cross-app projects and saved views (in `suite.sqlite`,
 * tables unchanged from the old `otterware` branch). Code's own contributor
 * and the assistant project are host-owned (ADR 0004) and reach Home through
 * module-kit's `HomeContributors` and `assistant.ensureProject`.
 */
import { HOME_METHODS, HomeContract } from "@otterware/home-contracts";
import { defineServerModule } from "@otterware/module-kit/engine";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Home from "./Home.ts";
import * as HomeStore from "./HomeStore.ts";
import * as HomeToolkit from "./HomeToolkit.ts";

const rpcHandlers = Effect.gen(function* () {
  const home = yield* Home.Home;
  const store = yield* HomeStore.HomeStore;
  return HomeContract.group.of({
    [HOME_METHODS.overview]: (input) => home.overview(input),
    [HOME_METHODS.performAction]: (input) => home.performAction(input).pipe(Effect.as({})),
    [HOME_METHODS.saveProject]: (input) => store.saveProject(input),
    [HOME_METHODS.deleteProject]: ({ id }) => store.deleteProject(id).pipe(Effect.as({})),
    [HOME_METHODS.saveView]: (input) => store.saveView(input),
    [HOME_METHODS.deleteView]: ({ id }) => store.deleteView(id).pipe(Effect.as({})),
  });
});

export const HomeModule = defineServerModule({
  contract: HomeContract,
  migrations: HomeStore.HOME_MIGRATIONS,
  layer: Home.layer.pipe(Layer.provideMerge(HomeStore.layer)),
  rpcHandlers,
  tools: { toolkit: HomeToolkit.HomeToolkit, handlers: HomeToolkit.handlers },
  agentInstructions: `## Home

\`home_overview\` lists what needs the user across the installed modules, ranked, with today's events and running agents; use it for "what needs me today?" or "what's next?". Cross-app projects group a customer's or product's mail, events, files and Code projects: \`home_list_projects\`, \`home_get_project_overview\`; create or change them only when the user asks (\`home_create_project\`, \`home_update_project\`). A user message may carry a page context record (kind \`module-page\`): it names the app page and the items the user was looking at; use the module tools to read them.`,
});
