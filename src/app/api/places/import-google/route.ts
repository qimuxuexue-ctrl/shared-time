import { z } from "zod";

const requestSchema = z.object({
  url: z.url("请输入有效的 Google 地图分享链接").max(1200),
});

const coordinatePatterns = [
  /\/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
  /!3d(-?\d{1,2}(?:\.\d+)?)[^!]*!4d(-?\d{1,3}(?:\.\d+)?)/,
];

function isGoogleMapsHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "maps.app.goo.gl"
    || host === "goo.gl"
    || /(^|\.)google\.[a-z.]{2,}$/.test(host);
}

function coordinatesFrom(value: string) {
  for (const pattern of coordinatePatterns) {
    const match = value.match(pattern);
    if (match) return { latitude: Number(match[1]), longitude: Number(match[2]) };
  }

  try {
    const url = new URL(value);
    for (const key of ["q", "query", "ll", "center"]) {
      const parameter = url.searchParams.get(key);
      const match = parameter?.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
      if (match) return { latitude: Number(match[1]), longitude: Number(match[2]) };
    }
  } catch {
    return null;
  }
  return null;
}

function placeNameFrom(value: string) {
  try {
    const url = new URL(value);
    const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/);
    const rawName = placeMatch?.[1] || url.searchParams.get("q") || url.searchParams.get("query");
    if (!rawName || coordinatesFrom(rawName)) return "Google 地图位置";
    return decodeURIComponent(rawName.replace(/\+/g, " ")).trim().slice(0, 120) || "Google 地图位置";
  } catch {
    return "Google 地图位置";
  }
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const suppliedUrl = new URL(parsed.data.url);
  if (suppliedUrl.protocol !== "https:" || !isGoogleMapsHost(suppliedUrl.hostname)) {
    return Response.json({ error: "目前仅支持 Google 地图分享链接" }, { status: 400 });
  }

  try {
    let resolvedUrl = suppliedUrl.toString();
    if (!coordinatesFrom(resolvedUrl)) {
      const response = await fetch(resolvedUrl, {
        redirect: "follow",
        headers: { "user-agent": "ShareTimeline/1.0" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      resolvedUrl = response.url;
    }

    const resolved = new URL(resolvedUrl);
    if (!isGoogleMapsHost(resolved.hostname)) throw new Error("unexpected redirect");
    const coordinates = coordinatesFrom(resolvedUrl);
    if (!coordinates
      || coordinates.latitude < -90 || coordinates.latitude > 90
      || coordinates.longitude < -180 || coordinates.longitude > 180) {
      return Response.json({
        error: "这个链接里没有可读取的定位，请在 Google 地图中打开地点详情后重新复制分享链接",
      }, { status: 422 });
    }

    const name = placeNameFrom(resolvedUrl);
    return Response.json({
      place: {
        id: `google-${coordinates.latitude}-${coordinates.longitude}`,
        name,
        address: "从 Google 地图分享链接导入",
        ...coordinates,
      },
    });
  } catch {
    return Response.json({ error: "暂时无法读取这个链接，请稍后重试" }, { status: 502 });
  }
}
