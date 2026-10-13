/**
 * Page context as a composer context record: the side chat (and Home's thread
 * starters) send what the user is looking at as a `module-page` record plus a
 * leading reference link, so the transcript shows a chip and the provider
 * reads the payload in its `<t3_context>` envelope. Plain Otter Code decodes
 * the kind as an unknown record and keeps it, so threads stay readable there.
 */
import { ComposerContextId, type ComposerContextRecord, type ProjectId } from "@t3tools/contracts";
import {
  formatComposerContextReference,
  sanitizeComposerContextLabel,
} from "@t3tools/shared/composerContextReferences";
import type { ReactNode } from "react";

import { ContextChipShell } from "../../components/contextChipParts";
import type { ChatViewOutgoingMessageDecoration } from "../../components/ChatView";
import { randomUUID } from "../../lib/utils";
import { moduleRegistry } from "../registry";
import type { ModulePageContext } from "@otterware/module-kit/web";

export const MODULE_PAGE_CONTEXT_KIND = "module-page";

/** The chip label: "Calendar · Tuesday" or "Mail · Re: CORS for desktop". */
export function modulePageContextLabel(context: ModulePageContext): string {
  const moduleLabel =
    moduleRegistry.modules.find((module) => module.id === context.module)?.label ?? context.module;
  const focus =
    context.title !== moduleLabel ? context.title : (context.refs[0]?.label ?? context.title);
  return focus && focus !== moduleLabel ? `${moduleLabel} · ${focus}` : moduleLabel;
}

/** One message's context: the page, what is selected on it, and optionally a Code project. */
export function modulePageContextDecoration(
  context: ModulePageContext,
  extra?: { readonly codeProjectId?: ProjectId | undefined },
): ChatViewOutgoingMessageDecoration {
  const contextId = ComposerContextId.make(`module-page-${randomUUID().slice(0, 12)}`);
  const label = sanitizeComposerContextLabel(
    modulePageContextLabel(context),
    MODULE_PAGE_CONTEXT_KIND,
  );
  const record: ComposerContextRecord = {
    version: 1,
    contextId,
    kind: MODULE_PAGE_CONTEXT_KIND,
    label,
    payload: {
      module: context.module,
      title: context.title,
      refs: context.refs,
      ...(extra?.codeProjectId ? { codeProjectId: extra.codeProjectId } : {}),
    },
  };
  return {
    prefix: `${formatComposerContextReference({ kind: MODULE_PAGE_CONTEXT_KIND, contextId, label })} `,
    records: [record],
  };
}

/**
 * The transcript chip for a `module-page` reference; null for other kinds so
 * the timeline's own fallback still handles them.
 */
export function renderModulePageContextChip(
  kind: string,
  label: string,
  copyMarkdown: string,
): ReactNode | null {
  if (kind !== MODULE_PAGE_CONTEXT_KIND) return null;
  const module = moduleRegistry.modules.find((entry) => label.startsWith(entry.label));
  const Icon = module?.icon ?? moduleRegistry.modules[0]!.icon;
  return (
    <ContextChipShell
      kind="neutral"
      icon={<Icon />}
      label={label}
      aria-label={`Page context, ${label}`}
      data-markdown-copy={copyMarkdown}
      tooltip="What was on screen when this was sent. The agent can open it with the Otterware tools."
    />
  );
}
