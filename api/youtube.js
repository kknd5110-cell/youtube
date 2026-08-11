// 유튜브 API 프록시.
// 브라우저는 이 함수만 부르고, API 키는 서버에만 있어서 밖으로 노출되지 않습니다.
// 로컬에서는 .env.local, 배포 환경에서는 Vercel 환경변수에서 키를 읽어옵니다.

// 허용할 엔드포인트만 화이트리스트로 둡니다.
// 이렇게 하지 않으면 누구나 이 프록시로 아무 구글 API나 부를 수 있게 됩니다.
const ALLOWED = new Set(["search", "videos", "channels", "playlistItems", "commentThreads"]);

export default async function handler(req, res) {
  // 앱(Capacitor)에서는 다른 출처에서 호출하므로 CORS 허용이 필요합니다.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: { message: "서버에 YOUTUBE_API_KEY가 설정되지 않았어요." },
    });
  }

  const { endpoint, ...params } = req.query;

  if (!ALLOWED.has(endpoint)) {
    return res.status(400).json({
      error: { message: `허용되지 않은 엔드포인트예요: ${endpoint}` },
    });
  }

  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, v);
  }
  search.set("key", key);

  try {
    const upstream = await fetch(
      `https://www.googleapis.com/youtube/v3/${endpoint}?${search.toString()}`
    );
    const data = await upstream.json();

    // 브라우저 캐시. 채널 정보는 거의 안 바뀌니 하루, 나머지는 10분으로 둡니다.
    if (upstream.ok) {
      const maxAge = endpoint === "channels" ? 86400 : 600;
      res.setHeader("Cache-Control", `public, max-age=${maxAge}, s-maxage=${maxAge}`);
    }
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(502).json({
      error: { message: "유튜브 API에 연결하지 못했어요." },
    });
  }
}
