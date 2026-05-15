import { createFileRoute } from "@tanstack/react-router";
import { DevicesSection } from "../components/section/DevicesSection";

export const Route = createFileRoute("/devices")({ component: DevicesSection });
