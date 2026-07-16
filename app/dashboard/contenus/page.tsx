import { redirect } from "next/navigation";

export default function DashboardContenusRedirect() {
  redirect("/dashboard/runs");
}
