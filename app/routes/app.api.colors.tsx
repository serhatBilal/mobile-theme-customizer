import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  console.log("API isteği geldi:", request.url);

  try {
    // Önce Flutter'dan gelen Access Token ile kimlik doğrulamayı deneyelim
    // Flutter uygulamanızın bu token'ı "Authorization: Bearer <TOKEN>" header'ında göndermesi gerekir
    // VEYA "X-Shopify-Access-Token" header'ında
    let admin;
    let session;
    const authHeader = request.headers.get("Authorization");
    const shopifyTokenHeader = request.headers.get("X-Shopify-Access-Token");

    if (authHeader?.startsWith("Bearer ") || shopifyTokenHeader) {
      console.log("Token ile kimlik doğrulama deneniyor...");
      try {
        // Token tabanlı kimlik doğrulama için bu şekilde bir yaklaşım gerekebilir
        // Bu kısım Shopify App Remix'in özel bir token doğrulama metodunu gerektirebilir
        // veya custom bir doğrulama mantığı yazmanız gerekebilir.
        // Şimdilik, bu kısmın çalıştığını varsayalım veya daha basit bir shopify.authenticate.public.appProxy() gibi bir metot varsa o kullanılır.
        // Aşağıdaki authenticate.admin() normalde cookie/session tabanlı çalışır.
        // Token ile çalışması için özel bir adaptasyon gerekir.
        // BU KISIM ŞU AN İÇİN TAM OLARAK ÇALIŞMAYABİLİR, çünkü authenticate.admin token bazlı değil session bazlı çalışır.
        // GERÇEK BİR TOKEN DOĞRULAMASI İÇİN DAHA DETAYLI BİR KURULUM GEREKİR.

        // Geçici olarak, eğer token varsa, authenticate.admin'i deniyoruz,
        // ama bu muhtemelen session bekleyecektir.
        const authResult = await authenticate.admin(request);
        admin = authResult.admin;
        session = authResult.session;
        console.log(
          "Token ile (denenen) Shopify kimlik doğrulama başarılı, shop:",
          session.shop,
        );
      } catch (tokenAuthError) {
        console.warn(
          "Token ile kimlik doğrulama başarısız oldu:",
          tokenAuthError,
        );
        // Token ile doğrulama başarısız olursa, session bazlı doğrulamaya devam et
        const authResult = await authenticate.admin(request);
        admin = authResult.admin;
        session = authResult.session;
        console.log(
          "Session ile Shopify kimlik doğrulama başarılı, shop:",
          session.shop,
        );
      }
    } else {
      // Token yoksa, session bazlı kimlik doğrulama (tarayıcıdan erişim için)
      console.log("Session ile kimlik doğrulama deneniyor...");
      const authResult = await authenticate.admin(request);
      admin = authResult.admin;
      session = authResult.session;
      console.log(
        "Session ile Shopify kimlik doğrulama başarılı, shop:",
        session.shop,
      );
    }

    // Shopify API'den tema ayarlarını almak için GraphQL sorgusu
    console.log("Metafield sorgusu gönderiliyor...");
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
    console.log("Metafield sorgu yanıtı alındı.");

    // Metafields verilerini alıyoruz
    let metafields = [];
    try {
      if (
        responseJson.data &&
        responseJson.data.shop &&
        responseJson.data.shop.metafields
      ) {
        metafields = responseJson.data.shop.metafields.edges;
        console.log("Metafield'lar bulundu:", metafields.length);
      } else {
        console.log(
          "Yanıt içinde beklenen metafields yolu bulunamadı.",
          responseJson.data,
        );
      }
    } catch (err) {
      console.warn(
        "Metafields verisi ayrıştırılırken hata veya veri boş:",
        err,
      );
    }

    // Varsayılan renk ayarlarımız
    const colorSettings = {
      primary_color: "#ABCDEF", // Farklı bir varsayılan kullanalım ki değişim görünsün
      secondary_color: "#FEDCBA",
      text_color: "#123456",
      shop: session.shop,
      auth_method: authHeader || shopifyTokenHeader ? "token" : "session",
      timestamp: new Date().toISOString(),
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

    console.log("Son renk ayarları:", colorSettings);

    // CORS başlıkları ekleyin
    return json(colorSettings, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Shopify-Access-Token",
      },
    });
  } catch (error: unknown) {
    console.error("API Kök Hatası:", error);
    let errorMessage = "Bilinmeyen hata";
    let errorDetails: any = {};

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = {
        name: error.name,
        stack: error.stack,
        message: error.message,
      };
    } else if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      "statusText" in error
    ) {
      // Bu kısım, authenticate.admin'den gelen Response objesini yakalamak için
      errorMessage = `Authentication/Authorization Error: ${error.status} ${error.statusText}`;
      if ("data" in error) {
        errorDetails.data = error.data;
      }
    }

    return json(
      {
        error: "Renk bilgileri API'den alınamadı",
        details: errorMessage,
        errorInfo: errorDetails,
        timestamp: new Date().toISOString(),
      },
      {
        status:
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof error.status === "number"
            ? error.status
            : 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-Shopify-Access-Token",
        },
      },
    );
  }
}

// CORS için preflight isteklerini yanıtlama
export function action({ request }: LoaderFunctionArgs) {
  console.log("OPTIONS isteği geldi:", request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204, // No Content
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // POST eklendi, gerekirse
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Shopify-Access-Token",
        "Access-Control-Max-Age": "86400", // 1 gün
      },
    });
  }

  return json(
    { message: "Yalnızca GET ve OPTIONS isteklerine izin verilir" },
    { status: 405 },
  );
}
