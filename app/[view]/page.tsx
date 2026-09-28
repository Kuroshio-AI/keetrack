import { AppShell } from "@/components/app-shell";

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  return <AppShell initialView={view} />;
}
