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
  // "input" is the new param; "link" is kept for backward compatibility
  const input = firstParam(params.input) ?? firstParam(params.link);

  if (store) {
    target.set("store", store);
  }
  if (input) {
    target.set("input", input);
  }

  const query = target.toString();
  redirect(`/orders/external/new${query ? `?${query}` : ""}`);
}
