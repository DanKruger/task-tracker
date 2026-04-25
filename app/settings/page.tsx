import { SettingsPanel } from "@/components/settings-panel"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Settings | Geist",
  description: "Manage settings for Geist",
}

export default function SettingsPage() {
  return <SettingsPanel />
}
