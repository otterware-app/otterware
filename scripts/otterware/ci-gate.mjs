/** A skipped job is legitimate only when the successful planner explicitly omitted it. */
export function gateFailures(needs, jobs) {
  const failures = [];
  if (needs.plan?.result !== "success") failures.push("plan did not succeed");
  for (const [job, planned] of Object.entries(jobs)) {
    const result = needs[job]?.result;
    if (planned ? result !== "success" : result !== "skipped")
      failures.push(
        `${job}: expected ${planned ? "success" : "skipped"}, got ${result ?? "missing"}`,
      );
  }
  for (const job of Object.keys(needs))
    if (job !== "plan" && !Object.hasOwn(jobs, job)) failures.push(`Unplanned job: ${job}`);
  return failures;
}

if (process.env.CI_GATE_RESULTS) {
  const failures = gateFailures(
    JSON.parse(process.env.CI_GATE_RESULTS),
    JSON.parse(process.env.CI_GATE_JOBS),
  );
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }
}
