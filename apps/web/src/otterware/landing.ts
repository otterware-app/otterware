/**
 * Where the app opens: the active profile's landing route (`/home` for
 * Otterware, `/` for Otter Code). Only the app's first landing on `/`
 * redirects: later navigations to `/` (Code's places, Back from Settings)
 * keep Code's draft landing. Standalone profiles always return to their module
 * when navigating to `/`; deep links are untouched.
 */
import { activeProfile } from "@otterware/profiles/active";

function readInitialRoutePath(): string | null {
  if (typeof window === "undefined") return null;
  // Desktop uses hash history (`#/env/thread`); the window path is always "/" there.
  const { hash, pathname } = window.location;
  return hash.startsWith("#/") ? (hash.slice(1).split("?")[0] ?? "/") : pathname;
}

const initialRoutePath = readInitialRoutePath();
let landingConsumed = false;

/** The route to open instead of `/`; null to stay. Call from `/`'s `beforeLoad`. */
export function consumeProfileLanding(): string | null {
  const landing = activeProfile.landingRoute;
  if (landing === "/" || landing.length === 0) return null;
  if (!activeProfile.codeVisible) return landing;
  if (landingConsumed) return null;
  landingConsumed = true;
  const firstOpen =
    initialRoutePath === "/" || initialRoutePath === "" || initialRoutePath === "/pair";
  return firstOpen ? landing : null;
}
