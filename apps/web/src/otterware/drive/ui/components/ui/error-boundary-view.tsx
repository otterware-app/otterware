import { Component, type ReactNode } from "react";

import { Button } from "./button";

/** Drive's error screen (Otter Mail's): what broke, with a way to try again. */
function ErrorBoundaryView({ error, reset }: { error: unknown; reset: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-sidebar p-8 text-center">
      <div className="flex max-w-md flex-col gap-1.5">
        <h1 className="text-2xl leading-7.5 font-normal tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p data-selectable="" className="text-sm leading-5 break-words text-muted-foreground">
          {message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button variant="accent" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}

/** Keeps a render error inside Drive's window instead of the whole app. */
export class DriveErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override render() {
    if (this.state.error === null) return this.props.children;
    return (
      <ErrorBoundaryView error={this.state.error} reset={() => this.setState({ error: null })} />
    );
  }
}
