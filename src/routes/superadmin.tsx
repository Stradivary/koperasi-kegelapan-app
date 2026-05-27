import { createFileRoute } from "@tanstack/react-router";
import { SuperadminSection } from "#/components/section/SuperadminSection";

export const Route = createFileRoute("/superadmin")({
  component: SuperadminPage,
});

function SuperadminPage() {
  return <SuperadminSection />;
}
