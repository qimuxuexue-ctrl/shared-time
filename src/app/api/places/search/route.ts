import { z } from "zod";

const querySchema = z.object({
  q: z.string().trim().min(2, "请输入至少两个字符").max(120),
  sessionToken: z.string().trim().min(8).max(100),
});

type GooglePrediction = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    q: searchParams.get("q"),
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
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify({
        input: parsed.data.q,
        languageCode: "zh-CN",
        sessionToken: parsed.data.sessionToken,
      }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Google autocomplete failed");

    const payload = (await response.json()) as { suggestions?: GooglePrediction[] };
    return Response.json({
      places: (payload.suggestions ?? []).flatMap((suggestion) => {
        const prediction = suggestion.placePrediction;
        if (!prediction?.placeId) return [];
        return [{
          id: prediction.placeId,
          name: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "未命名地点",
          address: prediction.structuredFormat?.secondaryText?.text ?? prediction.text?.text ?? "",
        }];
      }),
    });
  } catch {
    return Response.json({ error: "Google 地点搜索暂时不可用" }, { status: 502 });
  }
}
