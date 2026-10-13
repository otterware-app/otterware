/**
 * What a module's route files share. A module page is reached at
 * `/<module id>` and `/<module id>/<subpath>`, so each module has two route
 * files, `routes/<id>.tsx` and `routes/<id>.$.tsx`, both built from here.
 * The route renders nothing itself: `ModulePagesHost` shows the page.
 */
import { redirect } from "@tanstack/react-router";

/** Module pages need a paired environment, like the Code routes under `_chat`. */
export function requireModuleRouteAuth({
  context,
}: {
  readonly context: { readonly authGateState: { readonly status: string } };
}): void {
  if (
    context.authGateState.status !== "authenticated" &&
    context.authGateState.status !== "hosted-static"
  ) {
    throw redirect({ to: "/pair", replace: true });
  }
}

export const ModuleRouteComponent = (): null => null;
