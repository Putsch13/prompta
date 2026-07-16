import { redirect } from "next/navigation";

export default function DashboardPayoutsRedirect() {
  redirect("/dashboard/runs");
}
