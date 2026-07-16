import { redirect } from "next/navigation";

export default function DashboardDocumentsRedirect() {
  redirect("/dashboard/runs");
}
