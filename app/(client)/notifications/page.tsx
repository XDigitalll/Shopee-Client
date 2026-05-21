import { redirect } from "next/navigation";

export default function CustomerNotificationsRedirectPage() {
  redirect("/orders");
}
