import { redirect } from "next/navigation";

// Manager dashboard was consolidated into Tickets.
export default function ManagerPage() {
  redirect("/tickets");
}
