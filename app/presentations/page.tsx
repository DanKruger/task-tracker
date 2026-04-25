import { PresentationsPanel } from "@/components/presentations-panel"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Presentations | Geist",
  description: "Generate Presentations from your tasks",
}

export default function PresentationsPage() {
  return <PresentationsPanel />
}
