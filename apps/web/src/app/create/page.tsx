import { redirect } from "next/navigation";

/** Creation lives on the surface now (the create panel). */
export default function CreateRedirect() {
  redirect("/?panel=create");
}
