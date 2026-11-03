import { createFileRoute } from "@tanstack/react-router";
import { ForkSettingsPanel } from "../fork/ForkSettingsPanel";

export const Route = createFileRoute("/_chat/settings/fork")({ component: ForkSettingsPanel });
