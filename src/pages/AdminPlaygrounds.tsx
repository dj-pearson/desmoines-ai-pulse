import AdminPlaceholder from "@/components/admin/AdminPlaceholder";

export default function AdminPlaygrounds() {
  return (
    <AdminPlaceholder
      title="Playgrounds"
      storyId="ADMIN-PLAYGROUND-001"
      description="Bulk editor with inline-editable cells and manual-curation override so admin edits are not clobbered by populate-playgrounds re-runs."
    />
  );
}
