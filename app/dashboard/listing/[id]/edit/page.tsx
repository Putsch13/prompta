import { redirect } from "next/navigation";

export default function DashboardListingEditRedirect() {
  redirect("/dashboard/runs");
}
