import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Adım 1: Kimlik doğrulama
    console.log("Kimlik doğrulama başlatılıyor...");
    const { admin, session } = await authenticate.admin(request);
    console.log("Kimlik doğrulama başarılı, shop:", session.shop);

    // Adım 2: Basitleştirilmiş test yanıtı
    // Bu ilk aşamada sadece statik değerler döndürelim
    const colorSettings = {
      primary_color: "#FF5733",
      secondary_color: "#33FF57",
      text_color: "#333333",
      shop: session.shop, // Doğrulama için mağaza bilgisini ekleyelim
      timestamp: new Date().toISOString(),
    };

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
    let errorMessage = "Bilinmeyen hata";
    let errorDetails = {};

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = {
        name: error.name,
        stack: error.stack,
      };
    }

    return json(
      {
        error: "Renk bilgileri alınamadı",
        details: errorMessage,
        errorInfo: errorDetails,
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
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
