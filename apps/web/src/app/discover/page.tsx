import { redirect } from "next/navigation";

/** Discovery lives on the surface now (the search panel). */
export default function DiscoverRedirect() {
  redirect("/?panel=search");
}
