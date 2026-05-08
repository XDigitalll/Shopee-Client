import { redirect } from "next/navigation";

export default function ExternalOrderPage() {
  redirect("/orders/external/new");
}
