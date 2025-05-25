import { json, type LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  // Basit bir test yanıtı
  return json({
    hello: "world from app.api.colors",
    primary_color: "#FF5733",
    secondary_color: "#33FF57",
    text_color: "#333333",
  });
}
