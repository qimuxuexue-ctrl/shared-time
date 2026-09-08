import { z } from "zod";

const querySchema = z.object({
  q: z.string().trim().min(2, "请输入至少两个字符").max(120),
});

type NominatimPlace = {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
};

export async function GET(request: Request) {
  const parsed = querySchema.safeParse({
    q: new URL(request.url).searchParams.get("q"),
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({
      q: parsed.data.q,
      format: "jsonv2",
      addressdetails: "1",
      limit: "5",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, {
      headers: {
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
        "user-agent": "ShareTimeline/1.0",
      },
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error("place search failed");

    const places = (await response.json()) as NominatimPlace[];
    return Response.json({
      places: places.map((place) => ({
        id: String(place.place_id),
        name: place.name?.trim() || place.display_name.split(",")[0],
        address: place.display_name,
        latitude: Number(place.lat),
        longitude: Number(place.lon),
      })),
    });
  } catch {
    return Response.json({ error: "地点搜索暂时不可用" }, { status: 502 });
  }
}
