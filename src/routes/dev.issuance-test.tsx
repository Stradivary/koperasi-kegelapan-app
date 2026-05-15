import { createFileRoute } from "@tanstack/react-router";
import { IssuanceTestSection } from "#/components/section/IssuanceTestSection";

export const Route = createFileRoute("/dev/issuance-test")({
  component: IssuanceTestSection,
});
