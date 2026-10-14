import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";
import { useDriveHost, type DriveHost } from "../host";

/**
 * Drive's routes, in the shape its components were written against
 * (TanStack Router's `navigate({ to, params, search })`), resolved against
 * the host's location: `/home`, `/settings/<pane>`, `/<folder>/a/<slug>` and
 * `/<folder>/a/<slug>/<version>`, `/s/<token>`.
 */

export type SearchParams = Record<string, string | undefined>;

export interface NavigateOptions {
  /** A route template (`/$folderSlug/a/$slug`), or `.` for the current path. */
  to: string;
  params?: Record<string, string>;
  search?: SearchParams | ((current: SearchParams) => SearchParams);
  replace?: boolean;
}

export function readSearch(search: string): SearchParams {
  return Object.fromEntries(new URLSearchParams(search));
}

function writeSearch(search: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search))
    if (value !== undefined && value !== "") query.set(key, value);
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** The path and query `options` lead to from `location`. */
export function resolvePath(
  options: NavigateOptions,
  location: { pathname: string; search: string },
): string {
  const pathname =
    options.to === "."
      ? location.pathname
      : options.to.replace(/\$([A-Za-z]+)/g, (_, name: string) =>
          encodeURIComponent(options.params?.[name] ?? ""),
        );
  const current = readSearch(location.search);
  const search =
    typeof options.search === "function" ? options.search(current) : (options.search ?? {});
  return `${pathname}${writeSearch(search)}`;
}

/** Navigates within Drive; the host's history applies any blocker. */
function go(host: DriveHost, path: string, replace: boolean) {
  host.navigate(path, { replace });
}

export function useNavigate() {
  const host = useDriveHost();
  return useCallback(
    async (options: NavigateOptions) =>
      go(host, resolvePath(options, host.location), options.replace ?? false),
    [host],
  );
}

export type ShouldBlockFn = (args: {
  current: { pathname: string };
  next: { pathname: string };
}) => boolean;

type BlockerState =
  | { status: "idle"; proceed: () => void; reset: () => void }
  | { status: "blocked"; proceed: () => void; reset: () => void };

const idle: BlockerState = { status: "idle", proceed: () => {}, reset: () => {} };

/**
 * Holds Drive's navigations, the browser's Back and Forward included, while
 * `shouldBlockFn` says so, until the page proceeds or resets;
 * `enableBeforeUnload` also asks before the tab closes. Leaving Drive for
 * another page of the Otterware shell keeps Drive mounted, so that is never held.
 */
export function useBlocker({
  shouldBlockFn,
  enableBeforeUnload,
}: {
  shouldBlockFn: ShouldBlockFn;
  enableBeforeUnload: () => boolean;
  withResolver: true;
}): BlockerState {
  const host = useDriveHost();
  const [state, setState] = useState<BlockerState>(idle);
  const current = useRef(host.location);
  useEffect(() => {
    current.current = host.location;
  }, [host.location]);
  const { blockNavigation } = host;
  useEffect(
    () =>
      blockNavigation({
        shouldBlock: (next) =>
          shouldBlockFn({ current: current.current, next })
            ? new Promise<boolean>((resolve) =>
                setState({
                  status: "blocked",
                  proceed: () => {
                    setState(idle);
                    resolve(false);
                  },
                  reset: () => {
                    setState(idle);
                    resolve(true);
                  },
                }),
              )
            : false,
        beforeUnload: enableBeforeUnload,
      }),
    [blockNavigation, shouldBlockFn, enableBeforeUnload],
  );
  return state;
}

/** An anchor to a Drive route: a real link (new tab, copy), navigating in place on a plain click. */
export function Link({
  to,
  params,
  search,
  replace,
  onClick,
  ...props
}: NavigateOptions & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const host = useDriveHost();
  const path = resolvePath(
    { to, ...(params ? { params } : {}), ...(search ? { search } : {}) },
    host.location,
  );
  return (
    <a
      {...props}
      href={host.href(path)}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        go(host, path, replace ?? false);
      }}
    />
  );
}

export type DrivePlace =
  | { kind: "home" }
  | { kind: "settings"; pane: string }
  | { kind: "document"; folderSlug: string; slug: string; version?: number }
  | { kind: "shared-link"; token: string };

/** The route a Drive path names. Unknown paths are the home view. */
export function parsePlace(pathname: string): DrivePlace {
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  const [first, second, third, fourth] = parts;
  if (first === "settings") return { kind: "settings", pane: second ?? "folder" };
  if (first === "s" && second) return { kind: "shared-link", token: second };
  if (first && second === "a" && third) {
    const number = fourth ? Number(fourth.replace(/^v/, "")) : NaN;
    return {
      kind: "document",
      folderSlug: first,
      slug: third,
      ...(Number.isInteger(number) && number > 0 ? { version: number } : {}),
    };
  }
  return { kind: "home" };
}
