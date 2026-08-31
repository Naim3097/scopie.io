import { redirect } from "next/navigation";

/** The feed IS "/" now — old links and stale PWA installs land here. */
export default async function FeedRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const v = typeof sp.v === "string" ? `?v=${encodeURIComponent(sp.v)}` : "";
  redirect(`/${v}`);
}
