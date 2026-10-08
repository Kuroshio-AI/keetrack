import type { Metadata } from "next";
import { FieldInspection } from "@/components/field-inspection";

export const metadata: Metadata = { title: "KeeTrack · Field inspection" };

export default async function FieldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FieldInspection id={id} />;
}
