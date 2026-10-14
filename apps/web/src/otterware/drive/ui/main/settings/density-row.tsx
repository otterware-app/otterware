import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "~/components/ui/select";

import { setListDensity, useListDensity, type ListDensity } from "../../lib/density";
import { SettingsRow } from "./settings-ui";

/** The document list's density: a device setting, so its row says so. */
export function ListDensityRow() {
  const density = useListDensity();
  return (
    <SettingsRow
      id="drive-list-density"
      title="Document list"
      description="Compact rows show only titles and dates. Stored on this device."
      control={
        <Select
          value={density ?? null}
          items={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
          disabled={undefined}
          onValueChange={(value) => {
            if (typeof value === "string") setListDensity(value as ListDensity);
          }}
        >
          <SelectTrigger size="sm" aria-label={"Document list density"}>
            <SelectValue placeholder={"Select…"} />
          </SelectTrigger>
          <SelectPopup>
            {[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ].map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}
