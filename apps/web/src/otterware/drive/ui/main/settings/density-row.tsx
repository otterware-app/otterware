import { RowSelect } from "../../components/ui/select";
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
        <RowSelect
          ariaLabel="Document list density"
          value={density}
          onValueChange={(value) => setListDensity(value as ListDensity)}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
      }
    />
  );
}
