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
            metafield(namespace: "mobile_app", key: "header_color") {
              value
            }
          }
        }
      `,
    );

    const responseJson = await response.json();
    console.log("Metafield sorgu yanıtı alındı:", responseJson);

    // Varsayılan renk ayarlarımız
    const colorSettings = {
      header_color: {
        hue: 0,
        saturation: 0,
        brightness: 0,
        alpha: 1,
      },
      shop: session.shop,
      auth_method: authHeader || shopifyTokenHeader ? "token" : "session",
      timestamp: new Date().toISOString(),
    };

    // Metafield'dan header_color değerini alın (eğer varsa)
    if (responseJson.data?.shop?.metafield?.value) {
      try {
        colorSettings.header_color = JSON.parse(
          responseJson.data.shop.metafield.value,
        );
        console.log(
          "Header rengi metafield'dan alındı:",
          colorSettings.header_color,
        );
      } catch (err) {
        console.warn("Header renk metafield değeri ayrıştırılamadı:", err);
      }
    } else {
      console.log("Header renk metafield bulunamadı veya boş.");
    }

    console.log("Son renk ayarları:", colorSettings);

    // CORS başlıkları ekleyin - Tüm kaynaklardan erişime izin verin
    return json(colorSettings, {
      headers: {
        "Access-Control-Allow-Origin": "*", // Tüm kaynaklardan erişime izin ver
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Shopify-Access-Token, X-API-KEY",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400", // 24 saat
      },
    });
  } catch (error: unknown) {
    console.error("API Kök Hatası:", error);
    let errorMessage = "Bilinmeyen bir hata oluştu.";
    let errorDetails: any = {};
    let responseStatus = 500; // Default to 500 Internal Server Error

    if (error instanceof Response) {
      // This handles Responses thrown by authenticate.admin or other Remix/Shopify functions
      console.log("Hata bir Response nesnesi. Durum:", error.status);
      const originalStatus = error.status;
      const locationHeader = error.headers.get("Location");

      if (originalStatus >= 300 && originalStatus < 400 && locationHeader) {
        // This is a redirect Response (e.g., 302 to /auth/login)
        // For an API, we shouldn't follow the redirect, but return 401.
        errorMessage = "Kimlik doğrulama başarısız veya gerekli.";
        responseStatus = 401; // Unauthorized
        errorDetails = {
          reason: "Authentication required; received redirect.",
          originalStatus: originalStatus,
          intendedRedirectLocation: locationHeader,
        };
        console.log(
          `API için kimlik doğrulama yönlendirmesi yakalandı (${originalStatus} to ${locationHeader}). 401 döndürülüyor.`,
        );
      } else {
        // It's a Response, but not a redirect (e.g., 400, 403, 500 from Shopify API or other sources)
        errorMessage = `API Hatası: ${error.status} ${error.statusText}`;
        responseStatus = error.status;
        try {
          // Attempt to parse the body of the error Response for more details
          const bodyText = await error.text(); // Use text() first to avoid JSON parse errors if not JSON
          errorDetails = { data: bodyText, originalStatus: error.status };
          // Optionally, try to parse as JSON if it seems like it might be
          // if (error.headers.get("content-type")?.includes("application/json")) {
          //   errorDetails.data = JSON.parse(bodyText);
          // }
        } catch (parseError) {
          console.warn("Hata yanıtının gövdesi ayrıştırılamadı:", parseError);
          errorDetails = {
            data: "Hata yanıtının gövdesi okunamadı.",
            originalStatus: error.status,
          };
        }
      }
    } else if (error instanceof Error) {
      // Standard JavaScript Error object
      errorMessage = error.message;
      responseStatus = 500; // Typically, unhandled errors become 500
      errorDetails = {
        name: error.name,
        message: error.message,
        // stack: error.stack, // Consider implications of exposing stack in production
      };
      // You might want to check error.message for specific Shopify auth errors here too
      // if (error.message.includes("some auth keyword")) {
      //   responseStatus = 401;
      // }
    } else {
      // Fallback for other types of thrown values
      errorMessage = "Beklenmeyen bir hata türü yakalandı.";
      responseStatus = 500;
      try {
        errorDetails = { received: JSON.stringify(error) };
      } catch (e) {
        errorDetails = { received: String(error) };
      }
    }

    console.log(
      `API hata yanıtı hazırlanıyor. Durum: ${responseStatus}, Mesaj: ${errorMessage}`,
    );

    return json(
      {
        error: "Renk ayarları API'den alınamadı.", // Generic top-level error message
        message: errorMessage, // More specific message from the error handling
        details: errorDetails, // Additional details about the error
        timestamp: new Date().toISOString(),
      },
      {
        status: responseStatus,
        headers: {
          "Access-Control-Allow-Origin": "*", // Tüm kaynaklardan erişime izin ver
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-Shopify-Access-Token, X-API-KEY",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400", // 24 saat
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
        "Access-Control-Allow-Origin": "*", // Tüm kaynaklardan erişime izin ver
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Shopify-Access-Token, X-API-KEY",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400", // 24 saat
      },
    });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
