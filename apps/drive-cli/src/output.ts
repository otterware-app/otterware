import pc from "picocolors";

export interface GlobalOptions {
  json?: boolean;
  profile?: string;
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function success(message: string): void {
  process.stdout.write(`${pc.green("✓")} ${message}\n`);
}

export function note(message: string): void {
  process.stdout.write(`${pc.dim(message)}\n`);
}

export function table(rows: Array<Record<string, string | number | null | undefined>>): void {
  if (rows.length === 0) {
    note("No results.");
    return;
  }
  console.table(rows);
}
