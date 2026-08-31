import { redirect } from "next/navigation";

/** Live rooms are cards in the feed now — there is no separate list. */
export default function LiveRedirect() {
  redirect("/");
}
