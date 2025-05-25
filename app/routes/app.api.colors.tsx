import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);

    // Shopify API'den tema ayarlarını almak için GraphQL sorgusu
    const response = await admin.graphql(
      `#graphql
        query {
          shop {
            name
            primaryDomain {
              url
            }
            metafields(first: 10, namespace: "theme_settings") {
              edges {
                node {
                  key
                  value
                }
              }
            }
          }
        }
      `,
    );

    const responseJson = await response.json();

    // Metafields verilerini alıyoruz
    let metafields = [];
    try {
      metafields = responseJson.data.shop.metafields.edges;
    } catch (err) {
      console.log("Metafields verisi bulunamadı veya boş:", err);
    }

    // Varsayılan renk ayarlarımız
    const colorSettings = {
      primary_color: "#FF5733", // Varsayılan değerler
      secondary_color: "#33FF57",
      text_color: "#333333",
    };

    // Metafields'dan renk değerlerini alın (eğer varsa)
    metafields.forEach((item: any) => {
      const { node } = item;
      if (node.key === "primary_color") {
        colorSettings.primary_color = node.value;
      } else if (node.key === "secondary_color") {
        colorSettings.secondary_color = node.value;
      } else if (node.key === "text_color") {
        colorSettings.text_color = node.value;
      }
    });

    // CORS başlıkları ekleyin
    return json(colorSettings, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error: unknown) {
    console.error("API Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Bilinmeyen hata";
    return json(
      { error: "Renk bilgileri alınamadı", details: errorMessage },
      { status: 500 },
    );
  }
}

// CORS için preflight isteklerini yanıtlama
export function action({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  return json(
    { message: "Yalnızca GET isteklerine izin verilir" },
    { status: 405 },
  );
}
