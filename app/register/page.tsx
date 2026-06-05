import { redirect } from "next/navigation";

type RegisterPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeRedirect(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/";
  }
  return value;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const target = safeRedirect(
    firstParam(params?.redirect) || firstParam(params?.next) || firstParam(params?.callbackUrl)
  );

  redirect(`/login?tab=register&redirect=${encodeURIComponent(target)}`);
}
