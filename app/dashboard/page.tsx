import { DashboardPanel } from "@/components/dashboard-panel"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard | Geist",
  description: "View Stats about your task data",
}

export default function DashboardPage() {
  return <DashboardPanel />
}
