import { createFileRoute } from "@tanstack/react-router";
import { DevicesSection } from "#/presentation/components/section/DevicesSection";

export const Route = createFileRoute("/devices")({ component: DevicesSection });
