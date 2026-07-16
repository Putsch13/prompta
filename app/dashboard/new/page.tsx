import { redirect } from "next/navigation";

export default function DashboardNewRedirect() {
  redirect("/dashboard/runs");
}
