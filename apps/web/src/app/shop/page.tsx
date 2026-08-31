import { redirect } from "next/navigation";

/** The AI shopper lives on the surface now (the ask panel). */
export default async function ShopRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? `&q=${encodeURIComponent(sp.q)}` : "";
  redirect(`/?panel=ask${q}`);
}
