import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "~/components/ui/select";
import { folderLabel, useFolders } from "../folders";
import { SettingsRow, SettingsSection } from "./settings-ui";

/** Which drive or folder the page's sections below apply to. */
export function FolderPickerSection() {
  const { folders, activeFolder, selectFolder } = useFolders();
  const options = folders.map((folder) => ({ value: folder.id, label: folderLabel(folder) }));
  return (
    <SettingsSection title="Drive">
      <SettingsRow
        title="Folder"
        description="The drive or folder the settings below apply to."
        control={
          <Select
            value={activeFolder?.id ?? null}
            items={options}
            onValueChange={(value) => {
              if (typeof value === "string") void selectFolder(value);
            }}
          >
            <SelectTrigger size="sm" aria-label="Folder">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectPopup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
    </SettingsSection>
  );
}
