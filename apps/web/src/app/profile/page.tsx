import { redirect } from "next/navigation";

/** Scopay lives on the surface now (the profile panel). */
export default function ProfileRedirect() {
  redirect("/?panel=profile");
}
