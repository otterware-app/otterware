import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";

const version = "0.14.0-otterware.20261013.100";
function publish(previous = "") {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "otterware-publish-test-"));
  try {
    const assets = NodePath.join(dir, "assets");
    NodeFS.mkdirSync(assets);
    NodeFS.writeFileSync(
      NodePath.join(assets, "latest-mac.yml"),
      `version: ${version}\nfiles:\n  - url: Otter-Code.zip\npath: Otter-Code.zip\n`,
    );
    NodeFS.writeFileSync(NodePath.join(assets, "Otter-Code.zip"), "archive");
    NodeFS.writeFileSync(NodePath.join(assets, `t3-${version}-linux-x64.tar.gz`), "server");
    NodeFS.writeFileSync(NodePath.join(assets, "SHA256SUMS"), "original checksums");
    const calls = NodePath.join(dir, "calls");
    NodeFS.writeFileSync(
      NodePath.join(dir, "gh"),
      `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const command = args[1];
if (command === 'view') process.exit(process.env.PREVIOUS ? 0 : 1);
if (command === 'download') {
  fs.writeFileSync(path.join(args[args.indexOf('--dir') + 1], 'SHA256SUMS'), 'hash  t3-' + process.env.PREVIOUS + '-linux-x64.tar.gz\\n');
}
const record = { command, args };
if (command === 'upload') {
  record.files = args.slice(3).filter(x => fs.existsSync(x) && fs.statSync(x).isFile()).map(x => ({ name: path.basename(x), text: fs.readFileSync(x, 'utf8') }));
}
fs.appendFileSync(process.env.CALLS, JSON.stringify(record) + '\\n');
`,
      { mode: 0o755 },
    );
    NodeChildProcess.execFileSync(
      "bash",
      [NodePath.resolve("scripts/otterware/publish-release.sh"), assets],
      {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          CALLS: calls,
          PREVIOUS: previous,
          VERSION: version,
          CHANNEL: "code-test",
          PROFILE: "code",
          SOURCE_SHA: "abc123",
          GITHUB_REPOSITORY: "otterware-app/otterware",
          GITHUB_SERVER_URL: "https://github.com",
          GITHUB_RUN_ID: "123",
        },
        stdio: "pipe",
      },
    );
    return NodeFS.readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse);
  } finally {
    NodeFS.rmSync(dir, { recursive: true, force: true });
  }
}

NodeTest.test(
  "publishes immutable assets before a pinned profile feed with matching checksums",
  () => {
    const calls = publish();
    const created = calls.filter((c) => c.command === "create");
    NodeAssert.equal(created[0].args[2], `otterware-code-v${version}`);
    NodeAssert.equal(created[1].args[2], "channel-code-test");
    NodeAssert.ok(created.every((c) => c.args.includes("otterware-app/otterware")));
    const uploads = calls.filter((c) => c.command === "upload");
    NodeAssert.ok(uploads[0].files.every((f) => !f.name.endsWith(".yml")));
    const manifest = uploads.flatMap((c) => c.files).find((f) => f.name === "latest-mac.yml");
    NodeAssert.ok(manifest.text.includes(`/otterware-code-v${version}/Otter-Code.zip`));
    const sums = uploads.flatMap((c) => c.files).find((f) => f.name === "SHA256SUMS");
    const hash = NodeCrypto.createHash("sha256").update(manifest.text).digest("hex");
    NodeAssert.ok(sums.text.includes(`${hash}  latest-mac.yml`));
  },
);

NodeTest.test("an older queued build never rewinds the rolling channel", () => {
  const calls = publish("0.14.0-otterware.20261014.200");
  NodeAssert.equal(calls.filter((c) => c.command === "create").length, 1);
  NodeAssert.equal(calls.filter((c) => c.command === "upload").length, 0);
});
