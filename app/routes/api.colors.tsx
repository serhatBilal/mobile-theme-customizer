import { json } from "@remix-run/node";

export async function loader() {
  return json({ hello: "world from api.colors" });
}
