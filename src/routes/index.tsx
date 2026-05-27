import { createFileRoute } from "@tanstack/react-router";
import { LoginSection } from "#/components/section/LoginSection";

export const Route = createFileRoute("/")({ component: LoginSection });
