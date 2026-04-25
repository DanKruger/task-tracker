import { HomePanel } from "@/components/home-panel"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Home | Geist",
  description: "View your tasks",
}

export default function HomePage() {
  return <HomePanel />
}
