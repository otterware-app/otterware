import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "~/components/ui/select";
import { toastManager } from "~/components/ui/toast";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

import { announceFoldersChanged, driveForFolder, useFolders } from "../folders";
import { folderUrl } from "../../lib/links";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settings-ui";
interface Member {
  id: string;
  email: string;
  role: "viewer" | "editor";
  userId: string | null;
}
export function MembersPane() {
  const { folders, activeFolder } = useFolders(),
    drive = driveForFolder(folders, activeFolder),
    qc = useQueryClient();
  const [email, setEmail] = useState(""),
    [role, setRole] = useState<"viewer" | "editor">("editor"),
    [saving, setSaving] = useState(false);
  const enabled = drive?.kind === "shared" && drive.role === "owner";
  const query = useQuery({
    queryKey: ["drive-members", drive?.id],
    enabled,
    queryFn: () => api<{ data: Member[] }>(`/api/v1/folders/${drive!.id}/members`),
  });
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/v1/folders/${drive!.id}/members`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["drive-members", drive?.id] });
      toastManager.add({
        type: "success",
        title: "Access granted. Share a link to this drive with them.",
      });
    } catch (e) {
      toastManager.add({ type: "error", title: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    try {
      await api(`/api/v1/folders/${drive!.id}/members/${id}`, {
        method: "DELETE",
      });
      await qc.invalidateQueries({ queryKey: ["drive-members", drive?.id] });
    } catch (e) {
      toastManager.add({ type: "error", title: e instanceof Error ? e.message : String(e) });
    }
  }
  return (
    <SettingsPageContainer
      title="Shared drive access"
      description={
        drive?.kind === "shared"
          ? `Access to ${drive.name} includes all its folders and documents.`
          : "My Drive is yours alone. Share its folders and documents from their menus, or create a shared drive for a team."
      }
    >
      {enabled ? (
        <>
          <SettingsSection id="drive-invite" title="Invite people">
            <SettingsRow
              title="Google email"
              description="They sign in with this Google account. No email is sent; copy and send them the drive link."
            >
              <form onSubmit={invite} className="mt-3 flex gap-2">
                <Input
                  aria-label="Email to invite"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Select
                  value={role ?? null}
                  items={[
                    { value: "editor", label: "Can edit" },
                    { value: "viewer", label: "Can view" },
                  ]}
                  disabled={undefined}
                  onValueChange={(value) => {
                    if (typeof value === "string") setRole(value as typeof role);
                  }}
                >
                  <SelectTrigger size="sm" aria-label={"Access"}>
                    <SelectValue placeholder={"Select…"} />
                  </SelectTrigger>
                  <SelectPopup>
                    {[
                      { value: "editor", label: "Can edit" },
                      { value: "viewer", label: "Can view" },
                    ].map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <Button type="submit" disabled={saving} variant="outline">
                  Invite
                </Button>
              </form>
            </SettingsRow>
            <SettingsRow
              title="Drive link"
              control={
                <Button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(folderUrl(drive!.id))
                      .then(() => toastManager.add({ type: "success", title: "Link copied" }))
                  }
                  variant="outline"
                >
                  Copy link
                </Button>
              }
            />
          </SettingsSection>
          <SettingsSection id="drive-people-with-access" title="People with access">
            {query.data?.data.map((m) => (
              <SettingsRow
                key={m.id}
                title={m.email}
                description={`${m.role === "editor" ? "Can edit" : "Can view"}${m.userId ? "" : " · Pending sign-in"}`}
                control={
                  <div className="flex gap-2">
                    {m.userId ? (
                      <Button
                        onClick={() => {
                          if (
                            !confirm(
                              `Transfer this shared drive to ${m.email}? You will become an editor.`,
                            )
                          )
                            return;
                          void api(`/api/v1/folders/${drive!.id}/owner`, {
                            method: "POST",
                            body: JSON.stringify({ userId: m.userId }),
                          })
                            .then(() => {
                              announceFoldersChanged();
                              void qc.invalidateQueries({ queryKey: ["actor"] });
                              toastManager.add({ type: "success", title: "Ownership transferred" });
                            })
                            .catch((e) => toastManager.add({ type: "error", title: e.message }));
                        }}
                        variant="outline"
                      >
                        Make owner
                      </Button>
                    ) : null}
                    <Button onClick={() => void remove(m.id)} variant={"ghost-destructive"}>
                      Remove
                    </Button>
                  </div>
                }
              />
            ))}
            {query.error ? <p role="alert">{query.error.message}</p> : null}
            {query.data?.data.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Only you have access.</p>
            ) : null}
          </SettingsSection>
        </>
      ) : drive?.kind === "shared" ? (
        <p className="p-4 text-sm text-muted-foreground">The drive owner manages invitations.</p>
      ) : null}
    </SettingsPageContainer>
  );
}
