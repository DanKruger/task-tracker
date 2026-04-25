import { LoginPanel } from "@/components/login-panel"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Login | Geist",
  description:
    "Sign in to view your tasks, dashboard metrics, and sprint presentations.",
}

export default function LoginPage() {
  return <LoginPanel />
}
