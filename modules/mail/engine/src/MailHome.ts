import { HomeItem } from "@otterware/module-kit/contracts";
import type { HomeContributor } from "@otterware/module-kit/engine";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MailRuntime } from "./MailRuntime.ts";

const decodeItems = Schema.decodeUnknownEffect(Schema.Array(HomeItem));
export const mailHomeContributor = Effect.gen(function* () {
  const runtime = yield* MailRuntime;
  return {
    module: "mail",
    needsYou: runtime.call("mail:homeItems", {}).pipe(
      Effect.flatMap(decodeItems),
      Effect.orElseSucceed(() => []),
    ),
  } satisfies HomeContributor;
});
