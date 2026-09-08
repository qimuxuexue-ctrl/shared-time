import { z } from "zod";

const querySchema = z.object({
  placeId: z.string().trim().min(1).max(300),
  sessionToken: z.string().trim().min(8).max(100),
});

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
};

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    placeId: searchParams.get("placeId"),
    sessionToken: searchParams.get("sessionToken"),
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Google 地点联想尚未配置" }, { status: 503 });
  }

  try {
    const query = new URLSearchParams({
      languageCode: "zh-CN",
      sessionToken: parsed.data.sessionToken,
    });
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(parsed.data.placeId)}?${query}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
        },
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error("Google place details failed");

    const place = (await response.json()) as GooglePlace;
    if (!place.id || !place.displayName?.text || place.location?.latitude === undefined || place.location.longitude === undefined) {
      throw new Error("Google place details incomplete");
    }

    return Response.json({
      place: {
        id: place.id,
        name: place.displayName.text,
        address: place.formattedAddress ?? "",
        latitude: place.location.latitude,
        longitude: place.location.longitude,
      },
    });
  } catch {
    return Response.json({ error: "暂时无法读取地点详情" }, { status: 502 });
  }
}
