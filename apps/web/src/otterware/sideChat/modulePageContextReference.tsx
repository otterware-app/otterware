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

import type { ChatViewOutgoingMessageDecoration } from "../../components/ChatView";
import { randomUUID } from "../../lib/utils";
import { moduleRegistry } from "../registry";
import { MODULE_PAGE_CONTEXT_KIND, type ModulePageContext } from "@otterware/module-kit/web";

/** The chip label: "Calendar · Tuesday" or "Mail · Re: CORS for desktop". */
export function modulePageContextLabel(context: ModulePageContext): string {
  const moduleLabel =
    moduleRegistry.modules.find((module) => module.id === context.module)?.label ?? context.module;
  const focus =
    context.title !== moduleLabel ? context.title : (context.refs[0]?.label ?? context.title);
  return focus && focus !== moduleLabel ? `${moduleLabel} · ${focus}` : moduleLabel;
}

/** The page's context as plain text, for agents that take it inline (the browser's chat). */
export function modulePageContextText(context: ModulePageContext): string {
  return [
    `The user is looking at ${modulePageContextLabel(context)}.`,
    ...context.refs.map(
      (ref) =>
        `- ${ref.kind} ${ref.id}${ref.label ? `: ${ref.label}` : ""}${ref.href ? ` (${ref.href})` : ""}`,
    ),
  ].join("\n");
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
