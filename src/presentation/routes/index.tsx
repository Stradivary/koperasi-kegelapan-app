import { createFileRoute } from "@tanstack/react-router";
import { LoginSection } from "#/presentation/components/section/LoginSection";

export const Route = createFileRoute("/")({ component: LoginSection });
