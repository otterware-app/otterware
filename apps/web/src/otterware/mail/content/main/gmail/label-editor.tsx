import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "~/components/ui/select";
import { useModifyThread, useUpdateLabel } from "./hooks";
import { beginUndoGroup } from "./undo";
import { isMoveSourceLabel, type ThreadDragPayload } from "./thread-drag";
import { capabilitiesOf } from "./capabilities";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import { useMailStore } from "../../../mailStore";
import { gmailApi } from "./api";
import { toast } from "./toast";

const GMAIL_LABEL_COLORS: { backgroundColor: string; textColor: string }[] = [
  { backgroundColor: "#fb4c2f", textColor: "#ffffff" },
  { backgroundColor: "#cc3a21", textColor: "#ffffff" },
  { backgroundColor: "#efa093", textColor: "#000000" },
  { backgroundColor: "#ff7537", textColor: "#ffffff" },
  { backgroundColor: "#ffad47", textColor: "#000000" },
  { backgroundColor: "#ffd6a2", textColor: "#000000" },
  { backgroundColor: "#fad165", textColor: "#000000" },
  { backgroundColor: "#fcda83", textColor: "#000000" },
  { backgroundColor: "#16a766", textColor: "#ffffff" },
  { backgroundColor: "#149e60", textColor: "#ffffff" },
  { backgroundColor: "#43d692", textColor: "#000000" },
  { backgroundColor: "#89d3b2", textColor: "#000000" },
  { backgroundColor: "#4a86e8", textColor: "#ffffff" },
  { backgroundColor: "#3c78d8", textColor: "#ffffff" },
  { backgroundColor: "#285bac", textColor: "#ffffff" },
  { backgroundColor: "#a4c2f4", textColor: "#000000" },
  { backgroundColor: "#a479e2", textColor: "#ffffff" },
  { backgroundColor: "#8e63ce", textColor: "#ffffff" },
  { backgroundColor: "#b99aff", textColor: "#000000" },
  { backgroundColor: "#f691b3", textColor: "#000000" },
  { backgroundColor: "#e07798", textColor: "#ffffff" },
  { backgroundColor: "#666666", textColor: "#ffffff" },
  { backgroundColor: "#999999", textColor: "#ffffff" },
  { backgroundColor: "#cccccc", textColor: "#000000" },
];

export function LabelEditor() {
  const [target, setTarget] = useState<{ accountId: string; labelId?: string | undefined } | null>(
    null,
  );
  const accounts = useMailStore((state) => state.current?.accounts) ?? [];
  const [color, setColor] = useState<{ backgroundColor: string; textColor: string } | undefined>();
  const modifyThread = useModifyThread();
  const updateLabel = useUpdateLabel();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    const open = (event: Event) => {
      const { command, arg } = (event as CustomEvent<{ command: string; arg?: string | undefined }>)
        .detail;
      if (
        command === "label.drop" &&
        useMailStore.getState().current?.host.canWrite?.() !== false
      ) {
        try {
          const drop = JSON.parse(arg ?? "") as {
            accountId: string;
            labelId: string;
            threads: ThreadDragPayload | null;
            source: string;
            keep: boolean;
          };
          const current = useMailStore.getState().current;
          const label = current?.labels[drop.accountId]?.find((label) => label.id === drop.labelId);
          if (!label) return;
          if (drop.threads) {
            const threads = drop.threads.threads.filter(
              (thread) => thread.accountId === drop.accountId,
            );
            if (!threads.length) {
              toast.error("Those conversations belong to another mailbox");
              return;
            }
            const account = current?.accounts.find((account) => account.id === drop.accountId);
            const remove =
              (!drop.keep || !capabilitiesOf(account).multipleLabels) &&
              isMoveSourceLabel(drop.threads.fromLabelId, drop.labelId)
                ? drop.threads.fromLabelId
                : null;
            beginUndoGroup(threads.length);
            for (const thread of threads)
              void modifyThread
                .mutateAsync({
                  accountId: thread.accountId,
                  threadId: thread.threadId,
                  addLabelIds: [drop.labelId],
                  ...(remove ? { removeLabelIds: [remove] } : {}),
                })
                .catch((error) => toast.error(String(error)));
          } else {
            const from = JSON.parse(drop.source) as { accountId: string; labelId: string };
            const source = current?.labels[from.accountId]?.find(
              (label) => label.id === from.labelId,
            );
            if (
              from.accountId !== drop.accountId ||
              !source ||
              label.name === source.name ||
              label.name.startsWith(`${source.name}/`)
            )
              return;
            void updateLabel
              .mutateAsync({
                accountId: drop.accountId,
                labelId: from.labelId,
                name: `${label.name}/${source.name.split("/").pop()}`,
              })
              .catch((error) => toast.error(String(error)));
          }
        } catch (error) {
          toast.error(String(error));
        }
        return;
      }
      if (command !== "label.new" && command !== "label.edit") return;
      const [requested, labelId] = (arg ?? "").split("\n");
      const accounts = useMailStore.getState().current?.accounts ?? [];
      const accountId = accounts.find((account) => account.id === requested)?.id ?? accounts[0]?.id;
      if (!accountId) return;
      setColor(
        labelId
          ? (useMailStore
              .getState()
              .current?.labels[accountId]?.find((label) => label.id === labelId)?.color ??
              undefined)
          : undefined,
      );
      setTarget({ accountId, ...(labelId ? { labelId } : {}) });
      setName(
        labelId
          ? (useMailStore
              .getState()
              .current?.labels[accountId]?.find((label) => label.id === labelId)?.name ?? "")
          : "",
      );
    };
    window.addEventListener("mail:shell-action", open);
    return () => window.removeEventListener("mail:shell-action", open);
  });
  const save = async (remove = false) => {
    if (!target || saving) return;
    setSaving(true);
    try {
      if (remove && target.labelId) await gmailApi.deleteLabel(target.accountId, target.labelId);
      else if (target.labelId)
        await updateLabel.mutateAsync({
          accountId: target.accountId,
          labelId: target.labelId,
          name: name.trim(),
          ...(color ? { color } : {}),
        });
      else await gmailApi.createLabel(target.accountId, name.trim());
      await queryClient.invalidateQueries({ queryKey: ["gmail:labels", target.accountId] });
      setTarget(null);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) setTarget(null);
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{target?.labelId ? "Edit label" : "New label"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-6">
          {!target?.labelId ? (
            <Select
              value={target?.accountId ?? null}
              onValueChange={(accountId) => {
                if (accountId) setTarget({ accountId });
              }}
            >
              <SelectTrigger aria-label="Mailbox">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name || account.email}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
          <Input
            aria-label="Label name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {target?.labelId &&
          capabilitiesOf(accounts.find((account) => account.id === target.accountId))
            .labelColors ? (
            <div className="flex flex-wrap gap-2">
              {GMAIL_LABEL_COLORS.map((swatch) => (
                <Button
                  key={swatch.backgroundColor}
                  variant={
                    color?.backgroundColor === swatch.backgroundColor ? "secondary" : "outline"
                  }
                  size="icon-sm"
                  aria-label={`Label color ${swatch.backgroundColor}`}
                  onClick={() => setColor(swatch)}
                >
                  <span
                    className="size-4 rounded-full"
                    style={{ backgroundColor: swatch.backgroundColor }}
                  />
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          {target?.labelId ? (
            <Button variant="destructive" disabled={saving} onClick={() => void save(true)}>
              Delete label
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setTarget(null)}>
            Cancel
          </Button>
          <Button disabled={saving || !name.trim()} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
