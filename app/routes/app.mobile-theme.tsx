import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useSubmit, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  ColorPicker,
  FormLayout,
  type HSBAColor,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

const METAFIELD_NAMESPACE = "mobile_app";
const METAFIELD_KEY = "header_color";

interface LoaderData {
  headerColor: HSBAColor;
  shopId: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Önce shop ID'sini alalım
  const shopResponse = await admin.graphql(
    `query {
      shop {
        id
        metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
          value
        }
      }
    }`,
  );

  const shopData = await shopResponse.json();
  const shopId = shopData.data.shop.id;
  const savedColor = shopData.data.shop.metafield?.value
    ? JSON.parse(shopData.data.shop.metafield.value)
    : {
        hue: 0,
        saturation: 0,
        brightness: 0,
        alpha: 1,
      };

  return json<LoaderData>({
    headerColor: savedColor,
    shopId: shopId,
  });
};

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const color = JSON.parse(formData.get("headerColor") as string) as HSBAColor;
  const shopId = formData.get("shopId") as string;

  // Renk değerini metafields'a kaydet
  const response = await admin.graphql(
    `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          namespace
          value
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            value: JSON.stringify(color),
            type: "json",
            ownerId: shopId,
          },
        ],
      },
    },
  );

  const responseJson = await response.json();

  if (responseJson.data?.metafieldsSet?.userErrors?.length > 0) {
    throw new Error(
      "Renk kaydedilirken bir hata oluştu: " +
        JSON.stringify(responseJson.data.metafieldsSet.userErrors),
    );
  }

  return json({ headerColor: color, shopId });
}

export default function MobileTheme() {
  const { headerColor, shopId } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const handleColorChange = (color: HSBAColor) => {
    const formData = new FormData();
    formData.append("headerColor", JSON.stringify(color));
    formData.append("shopId", shopId);
    submit(formData, { method: "post" });
  };

  return (
    <Page title="Mobil Tema Özelleştirme">
      <Layout>
        <Layout.Section>
          <Card>
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Header Rengi
              </Text>
              <ColorPicker
                onChange={handleColorChange}
                color={headerColor}
                allowAlpha={false}
              />
              <Text variant="bodyMd" as="p">
                Seçilen renk değerleri:
                <br />
                Ton: {headerColor.hue}°
                <br />
                Doygunluk: {headerColor.saturation}%
                <br />
                Parlaklık: {headerColor.brightness}%
              </Text>
            </FormLayout>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
