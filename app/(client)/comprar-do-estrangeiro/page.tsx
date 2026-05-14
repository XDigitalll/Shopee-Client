import { redirect } from "next/navigation";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ComprarDoEstrangeiroPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const target = new URLSearchParams();
  const store = firstParam(params.store);
  const link = firstParam(params.link);

  if (store) {
    target.set("store", store);
  }
  if (link) {
    target.set("link", link);
  }

  const query = target.toString();
  redirect(`/orders/external/new${query ? `?${query}` : ""}`);
}
