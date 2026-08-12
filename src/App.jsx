import React, { useState, useEffect, useCallback, useRef } from "react";
import { Search, Home, Bell, Play, ChevronLeft, ThumbsUp, Share2, Bookmark, Menu, X, Loader2, Zap, Volume2, VolumeX, ChevronUp, ChevronDown, MessageCircle, Users, Trash2, RotateCcw } from "lucide-react";

// API 키는 서버(api/youtube.js)에만 있습니다. 이 파일에는 키가 들어가지 않아요.
// 유튜브 API 호출을 프록시 경유로 바꿔주는 헬퍼입니다.
// 웹에서는 같은 서버의 /api/youtube를 그대로 부릅니다.
// 앱(Capacitor)으로 감싸면 폰 안에 서버가 없으므로, 배포된 주소를 VITE_API_BASE로 지정해요.
const API_BASE = import.meta.env.VITE_API_BASE || "";

async function ytFetch(endpoint, params) {
  const search = new URLSearchParams({ endpoint, ...params });
  const res = await fetch(`${API_BASE}/api/youtube?${search.toString()}`);
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || "유튜브 API 호출에 실패했어요.");
  }
  return data;
}

// 카테고리 칩은 검색(100유닛) 대신 카테고리별 인기 영상(1유닛)을 씁니다.
// 숫자는 유튜브가 정한 카테고리 ID예요.
const CATEGORIES = [
  { label: "전체", id: null },
  { label: "음악", id: "10" },
  { label: "게임", id: "20" },
  { label: "예능", id: "24" },
  { label: "브이로그", id: "22" },
  { label: "스포츠", id: "17" },
  { label: "여행", id: "19" },
  { label: "테크", id: "28" },
  { label: "요리", id: "26" },
  { label: "동물", id: "15" },
  { label: "뉴스", id: "25" },
];

const AVATAR_COLORS = ["#E8A33D", "#4A7A6B", "#B85C4F", "#8C7A5E", "#5C7A9E", "#9E5C8F"];

// localStorage 읽기/쓰기. 브라우저 설정에 따라 접근이 막힐 수 있어서 항상 try로 감쌉니다.
function loadStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // 저장 실패는 조용히 넘어갑니다 (시크릿 모드, 용량 초과 등)
  }
}

function colorForChannel(channelId) {
  let hash = 0;
  for (let i = 0; i < channelId.length; i++) hash = channelId.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function parseISODuration(iso) {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!match) return "0:00";
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// 초 단위 길이. 숏츠 판별에 씁니다.
function durationSeconds(iso) {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!match) return 0;
  return (
    parseInt(match[1] || "0", 10) * 3600 +
    parseInt(match[2] || "0", 10) * 60 +
    parseInt(match[3] || "0", 10)
  );
}

// 유튜브는 "이건 숏츠다"라는 정보를 API로 주지 않아서 길이로 판단합니다.
// 3분 이하면 숏츠로 취급해요.
const SHORTS_MAX_SECONDS = 180;

// 길이만으로는 숏츠와 일반 영상을 못 가릅니다.
// 특히 뮤직비디오·음원 영상이 2~3분이라 그대로 걸려들어요. 그래서 세 가지를 같이 봅니다.
const MUSIC_CATEGORY_ID = "10";

function isLikelyShort(v) {
  if (!v.seconds || v.seconds > SHORTS_MAX_SECONDS) return false;
  // 음악 카테고리는 뮤직비디오·음원이 대부분이라 통째로 뺍니다.
  if (v.categoryId === MUSIC_CATEGORY_ID) return false;
  // 90초 이하면 숏츠일 가능성이 높습니다.
  if (v.seconds <= 90) return true;
  // 90~180초는 제목이나 설명에 shorts 표시가 있을 때만 인정합니다.
  const text = `${v.title || ""} ${v.description || ""}`.toLowerCase();
  return text.includes("#shorts") || text.includes("#쇼츠") || text.includes("#short");
}

// 홈·인기 목록에서 짧은 영상을 걸러냅니다. 숏츠는 전용 탭에서 봐요.
// 너무 많이 빠져서 화면이 휑해지면 뒤에서부터 조금 되돌립니다.
function withoutShorts(list, floor = 10) {
  const long = list.filter((v) => !isLikelyShort(v));
  if (long.length >= floor) return long;
  const shorts = list.filter(isLikelyShort);
  return [...long, ...shorts.slice(0, floor - long.length)];
}

function formatViewCount(num) {
  const n = parseInt(num || "0", 10);
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
  return String(n);
}

function formatRelativeTime(dateStr) {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - then) / 1000);
  const units = [
    ["년", 31536000],
    ["개월", 2592000],
    ["주", 604800],
    ["일", 86400],
    ["시간", 3600],
    ["분", 60],
  ];
  for (const [label, secs] of units) {
    const val = Math.floor(diffSec / secs);
    if (val >= 1) return `${val}${label} 전`;
  }
  return "방금 전";
}

function extractYoutubeId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1);
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/embed/")[1];
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/shorts/")[1];
    }
  } catch (e) {
    return null;
  }
  return null;
}

// 검색 결과와 인기 영상 응답을 같은 형태로 맞춰주는 변환기
function toVideo(snippet, details, videoId) {
  return {
    videoId,
    title: snippet.title,
    channelTitle: snippet.channelTitle,
    channelId: snippet.channelId,
    thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url,
    publishedAt: snippet.publishedAt,
    // details가 아직 없으면(1단계 결과) 조회수·재생시간은 비워둡니다.
    views: details ? formatViewCount(details.statistics?.viewCount) : null,
    // 채널이 좋아요 수를 숨겨둔 영상은 값이 오지 않아 null이 됩니다.
    likeCount: details?.statistics?.likeCount ? formatViewCount(details.statistics.likeCount) : null,
    commentCount: details?.statistics?.commentCount ? formatViewCount(details.statistics.commentCount) : null,
    time: formatRelativeTime(snippet.publishedAt),
    dur: details ? parseISODuration(details.contentDetails?.duration) : null,
    seconds: durationSeconds(details?.contentDetails?.duration),
    categoryId: snippet.categoryId || null,
    description: snippet.description,
  };
}

// API 응답 캐시. 저장 시각을 함께 남겨서 일정 시간이 지나면 새로 받아옵니다.
// ttl을 짧게 하면 화면이 자주 바뀌지만 쿼터를 더 씁니다.
const CACHE_TTL = 10 * 60 * 1000; // 10분

async function withCache(key, fetcher, ttl = CACHE_TTL) {
  try {
    const hit = sessionStorage.getItem(key);
    if (hit) {
      const { at, data } = JSON.parse(hit);
      if (Date.now() - at < ttl) return data;
    }
  } catch (e) {
    // 캐시를 못 읽으면 그냥 새로 받아옵니다.
  }
  const data = await fetcher();
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch (e) {
    // 용량 초과 등 저장 실패는 무시합니다.
  }
  return data;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 검색은 두 단계입니다. search.list로 목록을 먼저 받고(썸네일·제목·채널명은 여기 다 있음),
// videos.list로 재생시간·조회수를 채웁니다. onPartial을 넘기면 1단계 결과를 바로 그려서
// 체감 속도를 크게 줄일 수 있어요.
async function searchYoutube(query, pageToken = "", onPartial) {
  const cacheKey = `loop:search:${query}:${pageToken}`;
  try {
    const hit = sessionStorage.getItem(cacheKey);
    if (hit) {
      const { at, data } = JSON.parse(hit);
      if (Date.now() - at < CACHE_TTL) return data;
    }
  } catch (e) {
    // 캐시를 못 읽으면 새로 받아옵니다.
  }

  const searchData = await ytFetch("search", {
    part: "snippet",
    type: "video",
    maxResults: "25",
    q: query,
    // 한국 결과를 우선합니다. 완전히 걸러내는 건 아니고 가중치예요.
    regionCode: "KR",
    relevanceLanguage: "ko",
    ...(pageToken ? { pageToken } : {}),
  });
  const raw = searchData.items || [];
  const nextPageToken = searchData.nextPageToken || null;

  const seen = new Set();
  const unique = raw.filter((it) => it.id?.videoId && !seen.has(it.id.videoId) && seen.add(it.id.videoId));
  if (unique.length === 0) return { items: [], nextPageToken };

  // 1단계: 재생시간·조회수 없이 먼저 그립니다.
  if (onPartial) {
    onPartial({
      items: unique.map((it) => toVideo(it.snippet, null, it.id.videoId)),
      nextPageToken,
    });
  }

  // 2단계: 상세 정보를 채웁니다.
  const detailsById = await fetchVideoDetails(unique.map((it) => it.id.videoId));
  const result = {
    items: withoutShorts(
      unique
        .filter((it) => detailsById[it.id.videoId])
        .map((it) => toVideo(it.snippet, detailsById[it.id.videoId], it.id.videoId))
    ),
    nextPageToken,
  };

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: result }));
  } catch (e) {
    // 저장 실패는 무시합니다.
  }
  return result;
}

// 영상 ID 목록으로 재생시간·조회수를 한 번에 받아옵니다 (1유닛).
async function fetchVideoDetails(ids) {
  const detailsData = await ytFetch("videos", {
    part: "contentDetails,statistics",
    id: ids.join(","),
  });
  const detailsById = {};
  (detailsData.items || []).forEach((d) => {
    detailsById[d.id] = d;
  });
  return detailsById;
}

// 채널의 업로드 재생목록에서 최근 영상을 가져옵니다.
// search.list(100유닛) 대신 playlistItems.list(1유닛)를 쓰기 때문에 훨씬 저렴합니다.
async function fetchChannelVideos(channelId) {
  return withCache(`loop:channel:${channelId}`, async () => {
    // 1) 채널의 "업로드" 재생목록 ID를 찾습니다.
    const chData = await ytFetch("channels", { part: "contentDetails", id: channelId });
    const uploadsId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) return [];

    // 2) 그 재생목록에서 최근 50개를 받아옵니다.
    const plData = await ytFetch("playlistItems", {
      part: "snippet",
      playlistId: uploadsId,
      maxResults: "50",
    });

    const items = (plData.items || []).filter((it) => it.snippet?.resourceId?.videoId);
    if (items.length === 0) return [];

    const ids = items.map((it) => it.snippet.resourceId.videoId);
    const detailsById = await fetchVideoDetails(ids);
    return items
      .filter((it) => detailsById[it.snippet.resourceId.videoId])
      .map((it) => {
        const vid = it.snippet.resourceId.videoId;
        // playlistItems의 channelTitle은 재생목록 소유자라서 영상 채널명으로 보정합니다.
        return toVideo({ ...it.snippet, channelId, channelTitle: it.snippet.videoOwnerChannelTitle || it.snippet.channelTitle }, detailsById[vid], vid);
      });
  }, 60 * 60 * 1000); // 채널 업로드는 자주 안 바뀌니 1시간 유지
}

// 숏츠 모으기. 여러 검색어에서 짧은 영상만 걸러내 섞습니다.
// 한 번에 넉넉히 모아둬야 스와이프가 끊기지 않아요.
// 숏츠는 카테고리별 인기 영상에서 짧은 것만 골라 씁니다.
// 카테고리 하나당 1유닛이라 검색(100유닛)을 안 쓰고도 다양하게 채울 수 있어요.
const SHORTS_CATEGORIES = [
  { label: "인기", id: null },
  { label: "예능", id: "24" },
  { label: "게임", id: "20" },
  { label: "스포츠", id: "17" },
  { label: "동물", id: "15" },
  { label: "브이로그", id: "22" },
  { label: "요리", id: "26" },
];

// ── 본 영상 기록 ───────────────────────────────────────────
// 이미 본 숏츠를 기억해뒀다가 다음에 제외합니다. 반복을 막는 가장 확실한 방법이에요.
const SEEN_KEY = "loop:seenShorts";
const SEEN_LIMIT = 600;

function loadSeen() {
  return new Set(loadStore(SEEN_KEY, []));
}

function markSeen(ids) {
  if (!ids.length) return;
  const prev = loadStore(SEEN_KEY, []);
  saveStore(SEEN_KEY, [...prev, ...ids].slice(-SEEN_LIMIT));
}

// ── 취향 점수 ──────────────────────────────────────────────
// 좋아요·저장은 올리고, 금방 넘긴 카테고리는 내립니다.
// 점수는 브라우저에만 저장되고 서버로 나가지 않아요.
const TOPIC_SCORE_KEY = "loop:topicScores";

function loadTopicScores() {
  return loadStore(TOPIC_SCORE_KEY, {});
}

function bumpTopicScore(topic, delta) {
  if (!topic) return;
  const scores = loadTopicScores();
  // -5 ~ +5로 묶어둬서 한 카테고리가 화면을 독점하지 않게 합니다.
  scores[topic] = Math.max(-5, Math.min(5, (scores[topic] || 0) + delta));
  saveStore(TOPIC_SCORE_KEY, scores);
}

// 점수가 높은 카테고리를 자주 고르되, 낮은 것도 가끔 섞어 새 취향을 찾아봅니다.
function pickTopics(count) {
  const scores = loadTopicScores();
  const pool = SHORTS_CATEGORIES.map((c) => ({
    cat: c,
    weight: (scores[c.label] || 0) + 6,
  }));

  const picked = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, w) => sum + w.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    picked.push(pool[idx].cat);
    pool.splice(idx, 1);
  }
  return picked;
}

// ── 다양성 섞기 ────────────────────────────────────────────
// 카테고리별 목록을 번갈아 하나씩 꺼내고, 같은 채널이 연달아 나오지 않게 미룹니다.
function interleave(buckets) {
  const queues = buckets.filter((b) => b && b.length > 0).map((b) => [...b]);
  const out = [];
  let lastChannel = null;

  while (queues.length > 0) {
    for (let i = 0; i < queues.length; i++) {
      const queue = queues[i];
      let takeAt = queue.findIndex((v) => v.channelId !== lastChannel);
      if (takeAt === -1) takeAt = 0;
      const [v] = queue.splice(takeAt, 1);
      out.push(v);
      lastChannel = v.channelId;
      if (queue.length === 0) {
        queues.splice(i, 1);
        i--;
      }
    }
  }
  return out;
}

// 카테고리별 인기 영상에서 짧은 것만 골라냅니다 (카테고리당 1유닛).
async function fetchShortsByCategory(cat) {
  return withCache(
    `loop:shortsCat:${cat.id || "all"}`,
    async () => {
      const data = await ytFetch("videos", {
        part: "snippet,contentDetails,statistics",
        chart: "mostPopular",
        regionCode: "KR",
        maxResults: "50",
        ...(cat.id ? { videoCategoryId: cat.id } : {}),
      });
      return shuffle(
        (data.items || [])
          .map((d) => toVideo(d.snippet, d, d.id))
          .filter(isLikelyShort)
          .map((v) => ({ ...v, topic: cat.label }))
      );
    },
    15 * 60 * 1000
  );
}

// 카테고리 4개를 골라 번갈아 섞습니다. 전부 합쳐도 4유닛이라 검색(100유닛)보다 훨씬 쌉니다.
async function fetchShorts(onFirst, exclude = []) {
  const picked = pickTopics(4);
  const seenBefore = loadSeen();
  const skip = new Set([...exclude, ...seenBefore]);
  const taken = new Set();
  const dedupe = (list) =>
    list.filter((v) => !skip.has(v.videoId) && !taken.has(v.videoId) && taken.add(v.videoId));

  // 앞의 두 카테고리를 먼저 받아 바로 보여줍니다.
  const firstRaw = await Promise.all(
    picked.slice(0, 2).map((c) => fetchShortsByCategory(c).catch(() => []))
  );
  let buckets = firstRaw.map(dedupe);

  // 본 영상을 다 걸러내 남는 게 없으면 기록을 무시하고 채웁니다.
  if (buckets.reduce((n, b) => n + b.length, 0) < 5) {
    taken.clear();
    const relaxed = new Set(exclude);
    buckets = firstRaw.map((list) =>
      list.filter((v) => !relaxed.has(v.videoId) && !taken.has(v.videoId) && taken.add(v.videoId))
    );
  }

  if (onFirst) {
    const early = interleave(buckets);
    if (early.length > 0) {
      markSeen(early.map((v) => v.videoId));
      onFirst(early);
    }
  }

  const restRaw = await Promise.all(
    picked.slice(2).map((c) => fetchShortsByCategory(c).catch(() => []))
  );
  const all = interleave([...buckets, ...restRaw.map(dedupe)]);
  markSeen(all.map((v) => v.videoId));
  return all;
}

// 구독한 채널들의 최신 영상을 모아 업로드 순으로 정렬합니다.
// 채널 목록은 1시간 캐싱되니 다시 열 때는 요청이 거의 안 나가요.
async function fetchSubscriptionFeed(channelIds, perChannel = 6) {
  if (channelIds.length === 0) return [];
  const batches = await Promise.all(
    channelIds.map((id) => fetchChannelVideos(id).catch(() => []))
  );
  const seen = new Set();
  const merged = [];
  for (const batch of batches) {
    for (const v of batch.slice(0, perChannel)) {
      if (!seen.has(v.videoId)) {
        seen.add(v.videoId);
        merged.push(v);
      }
    }
  }
  // 최신 업로드가 위로 오게 정렬합니다.
  return merged.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

// 유튜브 CDN은 URL에 따라 404를 주기도 해서, 실패하면 다음 후보로 넘어갑니다.
// 후보가 다 떨어지면 색상 원으로 대체해요.
function FallbackImage({ sources, alt, style, fallbackColor }) {
  const [idx, setIdx] = useState(0);
  const list = (sources || []).filter(Boolean);

  useEffect(() => {
    setIdx(0);
  }, [list.join("|")]);

  if (list.length === 0 || idx >= list.length) {
    return <div style={{ ...style, background: fallbackColor || "#231F19" }} />;
  }

  return (
    <img
      src={list[idx]}
      alt={alt || ""}
      onError={() => setIdx((i) => i + 1)}
      style={style}
    />
  );
}

// 댓글 속 "12:34" 같은 시간 표기를 찾아 클릭 가능한 조각으로 나눕니다.
// 1:23:45(시:분:초)와 1:23(분:초) 둘 다 인식해요.
const TIMESTAMP_RE = /\b(\d{1,2}:)?([0-5]?\d):([0-5]\d)\b/g;

function splitTimestamps(text) {
  const parts = [];
  let last = 0;
  let m;
  TIMESTAMP_RE.lastIndex = 0;
  while ((m = TIMESTAMP_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    const hours = m[1] ? parseInt(m[1], 10) : 0;
    const seconds = hours * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    parts.push({ type: "time", value: m[0], seconds });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

function CommentText({ text, onSeek }) {
  const parts = splitTimestamps(text || "");
  return (
    <>
      {parts.map((p, i) =>
        p.type === "time" && onSeek ? (
          <button
            key={i}
            onClick={() => onSeek(p.seconds)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#E8A33D",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "inherit",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            {p.value}
          </button>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </>
  );
}

// 댓글 가져오기 (1유닛). 인기순 최상위 댓글을 50개씩 받아옵니다.
// 댓글을 꺼둔 영상은 403이 오므로 그 경우를 따로 표시합니다.
async function fetchComments(videoId, pageToken = "") {
  return withCache(
    `loop:comments:${videoId}:${pageToken}`,
    async () => {
      try {
        const data = await ytFetch("commentThreads", {
          part: "snippet",
          videoId,
          maxResults: "50",
          order: "relevance",
          textFormat: "plainText",
          ...(pageToken ? { pageToken } : {}),
        });
        return {
          disabled: false,
          nextPageToken: data.nextPageToken || null,
          items: (data.items || []).map((t) => {
            const c = t.snippet?.topLevelComment?.snippet || {};
            return {
              id: t.id,
              author: c.authorDisplayName,
              avatar: c.authorProfileImageUrl,
              text: c.textDisplay,
              likes: c.likeCount ? formatViewCount(c.likeCount) : null,
              time: c.publishedAt ? formatRelativeTime(c.publishedAt) : "",
              replies: t.snippet?.totalReplyCount || 0,
            };
          }),
        };
      } catch (e) {
        // 댓글 사용 중지 / 비공개 영상 등
        return { disabled: true, nextPageToken: null, items: [] };
      }
    },
    5 * 60 * 1000
  );
}

// 채널 상세 정보 (1유닛). 배너·소개·구독자 수를 가져옵니다.
// 커뮤니티 글은 유튜브가 공개 API로 제공하지 않아 가져올 수 없어요.
async function fetchChannelInfo(channelId) {
  return withCache(
    `loop:channelInfo:v2:${channelId}`,
    async () => {
      const data = await ytFetch("channels", {
        part: "snippet,statistics,brandingSettings",
        id: channelId,
      });
      const c = data.items?.[0];
      if (!c) return null;
      const banner = c.brandingSettings?.image?.bannerExternalUrl;
      const thumbs = c.snippet?.thumbnails || {};
      return {
        id: c.id,
        title: c.snippet?.title,
        description: c.snippet?.description || "",
        // 채널마다 있는 해상도가 달라서 큰 것부터 차례로 시도합니다.
        avatars: [thumbs.high?.url, thumbs.medium?.url, thumbs.default?.url].filter(Boolean),
        // 배너는 크기 파라미터를 붙여야 제대로 나옵니다.
        bannerSources: banner
          ? [`${banner}=w2560-fcrop64=1,00005a57ffffa5a8`, `${banner}=w1707`, banner]
          : [],
        publishedAt: c.snippet?.publishedAt,
        subscribers: c.statistics?.hiddenSubscriberCount
          ? null
          : formatViewCount(c.statistics?.subscriberCount),
        videoCount: c.statistics?.videoCount ? Number(c.statistics.videoCount).toLocaleString() : null,
        totalViews: c.statistics?.viewCount ? formatViewCount(c.statistics.viewCount) : null,
      };
    },
    60 * 60 * 1000
  );
}

// 한 댓글의 답글을 가져옵니다 (1유닛). 오래된 순으로 옵니다.
async function fetchReplies(commentId) {
  return withCache(
    `loop:replies:${commentId}`,
    async () => {
      try {
        const data = await ytFetch("comments", {
          part: "snippet",
          parentId: commentId,
          maxResults: "50",
          textFormat: "plainText",
        });
        return (data.items || []).map((c) => ({
          id: c.id,
          author: c.snippet?.authorDisplayName,
          avatar: c.snippet?.authorProfileImageUrl,
          text: c.snippet?.textDisplay,
          likes: c.snippet?.likeCount ? formatViewCount(c.snippet.likeCount) : null,
          time: c.snippet?.publishedAt ? formatRelativeTime(c.snippet.publishedAt) : "",
        }));
      } catch (e) {
        return [];
      }
    },
    5 * 60 * 1000
  );
}

// 채널 프로필 사진. 여러 채널을 콤마로 묶어 한 번에 받아오므로 전체가 1유닛입니다.
// 채널별로 캐싱해서 이미 아는 채널은 다시 묻지 않습니다.
async function fetchChannelAvatars(channelIds) {
  const result = {};
  const missing = [];

  for (const id of [...new Set(channelIds.filter(Boolean))]) {
    let hit = null;
    try {
      hit = sessionStorage.getItem(`loop:avatar:${id}`);
    } catch (e) {
      // 캐시를 못 읽으면 새로 받아옵니다.
    }
    if (hit) result[id] = hit;
    else missing.push(id);
  }
  if (missing.length === 0) return result;

  // channels.list는 한 번에 50개까지 받습니다.
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const data = await ytFetch("channels", { part: "snippet", id: chunk.join(",") });
    (data.items || []).forEach((c) => {
      const url = c.snippet?.thumbnails?.default?.url;
      if (!url) return;
      result[c.id] = url;
      try {
        sessionStorage.setItem(`loop:avatar:${c.id}`, url);
      } catch (e) {
        // 저장 실패는 무시합니다.
      }
    });
  }
  return result;
}

// 인기 급상승. videos.list 한 번이면 끝이라 검색(100유닛)과 달리 1유닛만 소모돼요.
async function fetchPopular(regionCode = "KR", pageToken = "", categoryId = null) {
  return withCache(
    `loop:popular:${regionCode}:${categoryId || "all"}:${pageToken}`,
    async () => {
      const data = await ytFetch("videos", {
        part: "snippet,contentDetails,statistics",
        chart: "mostPopular",
        regionCode,
        maxResults: "40",
        ...(categoryId ? { videoCategoryId: categoryId } : {}),
        ...(pageToken ? { pageToken } : {}),
      });
      return {
        items: withoutShorts((data.items || []).map((d) => toVideo(d.snippet, d, d.id))),
        nextPageToken: data.nextPageToken || null,
      };
    },
    20 * 60 * 1000
  );
}

// 구독한 채널들의 정보를 한 번에 받아옵니다. 50개까지 묶어 부르므로 대개 1유닛이에요.
async function fetchChannelsInfo(channelIds) {
  const ids = [...new Set(channelIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await ytFetch("channels", {
      part: "snippet,statistics",
      id: chunk.join(","),
    });
    (data.items || []).forEach((c) => {
      const thumbs = c.snippet?.thumbnails || {};
      out.push({
        id: c.id,
        title: c.snippet?.title,
        description: c.snippet?.description || "",
        avatars: [thumbs.high?.url, thumbs.medium?.url, thumbs.default?.url].filter(Boolean),
        subscribers: c.statistics?.hiddenSubscriberCount
          ? null
          : formatViewCount(c.statistics?.subscriberCount),
        videoCount: c.statistics?.videoCount ? Number(c.statistics.videoCount).toLocaleString() : null,
      });
    });
  }
  return out;
}

// 홈 화면. 인기 급상승 + 무작위 카테고리 2개 + 구독 채널 최신 영상을 섞습니다.
// 인기 급상승만 쓰면 순위표가 고정이라 새로고침해도 같은 영상만 나와요.
// 그래서 매번 다른 카테고리를 뽑아 섞습니다. 카테고리당 1유닛이라 부담이 없어요.
async function fetchHome(subscribedIds = []) {
  const pool = CATEGORIES.filter((c) => c.id);
  const picks = shuffle(pool).slice(0, 2);

  const [general, catA, catB] = await Promise.all([
    fetchPopular("KR").catch(() => ({ items: [], nextPageToken: null })),
    fetchPopular("KR", "", picks[0]?.id).catch(() => ({ items: [] })),
    fetchPopular("KR", "", picks[1]?.id).catch(() => ({ items: [] })),
  ]);

  const taken = new Set();
  const dedupe = (list) => shuffle(list).filter((v) => !taken.has(v.videoId) && taken.add(v.videoId));

  const buckets = [];
  if (subscribedIds.length > 0) {
    // 구독이 많으면 앞의 몇 개만 씁니다. 채널당 2유닛이라 무한정 늘리면 부담이 커요.
    const picked = shuffle(subscribedIds).slice(0, 5);
    const subVideos = await fetchSubscriptionFeed(picked, 4).catch(() => []);
    buckets.push(dedupe(subVideos));
  }
  buckets.push(dedupe(general.items), dedupe(catA.items), dedupe(catB.items));

  return {
    items: interleave(buckets),
    nextPageToken: general.nextPageToken,
  };
}


function FilmStrip({ style }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0 6px", ...style }}>
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} style={{ width: 4, height: 4, borderRadius: 1, background: "rgba(0,0,0,0.35)" }} />
      ))}
    </div>
  );
}

function Thumb({ v, big }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        borderRadius: big ? 10 : 8,
        overflow: "hidden",
        background: "#17140F",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {v.thumbnail && (
        <img
          src={v.thumbnail}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(14,13,11,0.35) 0%, rgba(14,13,11,0.02) 20%, rgba(14,13,11,0.02) 80%, rgba(14,13,11,0.45) 100%)",
        }}
      />
      <FilmStrip style={{ paddingTop: 6, position: "relative" }} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div
          style={{
            width: big ? 56 : 38,
            height: big ? 56 : 38,
            borderRadius: "50%",
            background: "rgba(15,13,10,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(2px)",
          }}
        >
          <Play size={big ? 24 : 16} color="#F2EDE4" fill="#F2EDE4" style={{ marginLeft: 2 }} />
        </div>
      </div>
      <FilmStrip style={{ paddingBottom: 6, position: "relative" }} />
      <div
        style={{
          position: "absolute",
          bottom: 10,
          right: 8,
          background: "rgba(14,13,11,0.75)",
          color: "#F2EDE4",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          padding: "2px 6px",
          borderRadius: 4,
          letterSpacing: 0.3,
          // 상세 정보가 아직 안 왔으면 배지를 숨깁니다.
          opacity: v.dur ? 1 : 0,
        }}
      >
        {v.dur || "0:00"}
      </div>
    </div>
  );
}

// 프로필 사진이 있으면 보여주고, 없으면 채널별 고정 색상 원을 씁니다.
function Avatar({ v, avatars, size }) {
  const url = avatars?.[v.channelId];
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const showImage = url && !failed;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: showImage ? "#231F19" : colorForChannel(v.channelId || v.videoId),
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {showImage && (
        <img
          src={url}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </div>
  );
}

function VideoCard({ v, onClick, avatars, onOpenChannel }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ cursor: "pointer", transform: hover ? "translateY(-3px)" : "none", transition: "transform 0.2s ease" }}
    >
      <Thumb v={v} />
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <div
          onClick={(e) => {
            // 카드 클릭(영상 재생)과 겹치지 않게 이벤트를 멈춥니다.
            if (!v.channelId || !onOpenChannel) return;
            e.stopPropagation();
            onOpenChannel(v.channelId);
          }}
          title={v.channelId && onOpenChannel ? "채널 보기" : undefined}
          style={{ marginTop: 2, cursor: v.channelId && onOpenChannel ? "pointer" : "inherit" }}
        >
          <Avatar v={v} avatars={avatars} size={34} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: "#F2EDE4",
              fontFamily: "'Fraunces', serif",
              fontSize: 14.5,
              lineHeight: 1.35,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {v.title}
          </div>
          <div
            onClick={(e) => {
              if (!v.channelId || !onOpenChannel) return;
              e.stopPropagation();
              onOpenChannel(v.channelId);
            }}
            style={{
              color: "#8C8578",
              fontSize: 12.5,
              marginTop: 4,
              fontFamily: "'Inter', sans-serif",
              display: "inline-block",
              cursor: v.channelId && onOpenChannel ? "pointer" : "inherit",
            }}
          >
            {v.channelTitle}
          </div>
          <div
            style={{
              color: "#8C8578",
              fontSize: 12,
              marginTop: 2,
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: 0.2,
            }}
          >
            {v.views ? `조회수 ${v.views}회 · ${v.time}` : v.time}
          </div>
        </div>
      </div>
    </div>
  );
}

// 세로 전체화면 숏츠 플레이어.
// 유튜브 iframe은 세로 영상도 16:9 틀에 담아 좌우 검은 여백을 넣어줍니다.
// 그래서 iframe을 가로로 크게 늘린 뒤 넘치는 부분을 잘라내 화면을 꽉 채웁니다.
// 댓글 목록. 일반 영상과 숏츠 양쪽에서 씁니다.
// 답글 목록. 필요할 때만 불러옵니다 (1유닛).
function Replies({ commentId, count, onSeek }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (items) return;
    setLoading(true);
    fetchReplies(commentId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={toggle}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "#E8A33D",
          fontSize: 11.5,
          cursor: "pointer",
          fontFamily: "'Inter', sans-serif",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        답글 {count}개
      </button>

      {open && (
        <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: "1px solid #231F19", display: "flex", flexDirection: "column", gap: 14 }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#8C8578", fontSize: 12 }}>
              <Loader2 size={13} className="spin" /> 답글을 불러오는 중…
            </div>
          )}

          {!loading && items?.length === 0 && (
            <div style={{ color: "#5C574C", fontSize: 12 }}>답글을 불러오지 못했어요.</div>
          )}

          {!loading &&
            items?.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 8 }}>
                <FallbackImage
                  sources={[r.avatar]}
                  style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, objectFit: "cover", background: "#231F19" }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ color: "#F2EDE4", fontSize: 11.5, fontWeight: 600 }}>{r.author}</span>
                    <span style={{ color: "#5C574C", fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace" }}>{r.time}</span>
                  </div>
                  <div style={{ color: "#D6D0C4", fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    <CommentText text={r.text} onSeek={onSeek} />
                  </div>
                  {r.likes && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, color: "#8C8578", fontSize: 10.5 }}>
                      <ThumbsUp size={11} /> {r.likes}
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function CommentList({ videoId, compact, onSeek }) {
  const [items, setItems] = useState([]);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const sentinelRef = useRef(null);

  // 영상이 바뀌면 처음부터 다시 불러옵니다.
  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setToken(null);
    setDisabled(false);
    setLoading(true);
    fetchComments(videoId)
      .then((r) => {
        if (cancelled) return;
        setDisabled(r.disabled);
        setItems(r.items);
        setToken(r.nextPageToken);
      })
      .catch(() => {
        if (!cancelled) setDisabled(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const loadMore = useCallback(async () => {
    if (!token || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const r = await fetchComments(videoId, token);
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...r.items.filter((c) => !seen.has(c.id))];
      });
      setToken(r.nextPageToken);
    } catch (e) {
      setToken(null);
    } finally {
      setLoadingMore(false);
    }
  }, [videoId, token, loadingMore, loading]);

  // 목록 끝이 보이면 다음 장을 이어붙입니다.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#8C8578", padding: "24px 0", fontSize: 13 }}>
        <Loader2 size={15} className="spin" /> 댓글을 불러오는 중…
      </div>
    );
  }

  if (disabled) {
    return <div style={{ color: "#5C574C", padding: "24px 0", fontSize: 13 }}>이 영상은 댓글을 사용할 수 없어요.</div>;
  }

  if (items.length === 0) {
    return <div style={{ color: "#5C574C", padding: "24px 0", fontSize: 13 }}>아직 댓글이 없어요.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 16 : 20 }}>
      {items.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 10 }}>
          <FallbackImage
            sources={[c.avatar]}
            style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, objectFit: "cover", background: "#231F19" }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ color: "#F2EDE4", fontSize: 12.5, fontWeight: 600 }}>{c.author}</span>
              <span style={{ color: "#5C574C", fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace" }}>{c.time}</span>
            </div>
            <div style={{ color: "#D6D0C4", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <CommentText text={c.text} onSeek={onSeek} />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, color: "#8C8578", fontSize: 11.5 }}>
              {c.likes && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <ThumbsUp size={12} /> {c.likes}
                </span>
              )}
            </div>
            {c.replies > 0 && <Replies commentId={c.id} count={c.replies} onSeek={onSeek} />}
          </div>
        </div>
      ))}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {loadingMore && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#8C8578", padding: "12px 0", fontSize: 12.5 }}>
          <Loader2 size={14} className="spin" /> 댓글 더 불러오는 중…
        </div>
      )}

      {!loadingMore && !token && (
        <div style={{ textAlign: "center", color: "#3A342C", padding: "12px 0", fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace" }}>
          댓글 끝
        </div>
      )}
    </div>
  );
}

// 세로 전체화면 숏츠 플레이어.
// 스와이프를 직접 감지하는 대신 브라우저 기본 스크롤 + CSS 스크롤 스냅을 씁니다.
// 훨씬 부드럽고, 관성 스크롤이나 손가락 속도도 자연스럽게 따라와요.
function ShortsView({ items, index, setIndex, onExit, avatars, likes, onToggleLike, savedVideos, onToggleSave, loadingMore, onTopicSignal }) {
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const scrollerRef = useRef(null);
  const framesRef = useRef({});
  const enteredAtRef = useRef(Date.now());
  const lastIndexRef = useRef(index);

  const post = useCallback((videoId, func, args = []) => {
    framesRef.current[videoId]?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*"
    );
  }, []);

  // 스크롤 위치로 현재 영상을 판단합니다.
  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = Math.round(el.scrollTop / el.clientHeight);
    if (next !== index && next >= 0 && next < items.length) setIndex(next);
  };

  // 영상이 바뀌면 이전 건 멈추고 새 건 재생합니다.
  // 다음 영상은 미리 로드돼 있어서 곧바로 시작돼요.
  useEffect(() => {
    const prev = items[lastIndexRef.current];
    const cur = items[index];

    if (prev && prev.videoId !== cur?.videoId) {
      post(prev.videoId, "pauseVideo");
      // 얼마나 봤는지 기록해서 다음 추천에 반영합니다.
      const stayed = (Date.now() - enteredAtRef.current) / 1000;
      if (prev.topic) {
        if (stayed < 3) onTopicSignal(prev.topic, -1);
        else if (stayed > 15) onTopicSignal(prev.topic, 1);
      }
    }

    if (cur) {
      post(cur.videoId, muted ? "mute" : "unMute");
      post(cur.videoId, "playVideo");
    }

    enteredAtRef.current = Date.now();
    lastIndexRef.current = index;
    setPlaying(true);
    setShowComments(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items]);

  // 목록이 새로 로드되면 맨 위로 돌려놓습니다.
  useEffect(() => {
    if (index === 0 && scrollerRef.current) scrollerRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length === 0]);

  const scrollToIndex = (i) => {
    const el = scrollerRef.current;
    if (!el || i < 0 || i >= items.length) return;
    el.scrollTo({ top: i * el.clientHeight, behavior: "smooth" });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollToIndex(index + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollToIndex(index - 1);
      } else if (e.key === "Escape") onExit();
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length, playing]);

  const togglePlay = () => {
    const cur = items[index];
    if (!cur) return;
    post(cur.videoId, playing ? "pauseVideo" : "playVideo");
    setPlaying((p) => !p);
  };

  const toggleMute = () => {
    const cur = items[index];
    if (cur) post(cur.videoId, muted ? "unMute" : "mute");
    setMuted((m) => !m);
  };

  if (items.length === 0) return null;

  return (
    <div style={{ position: "relative", height: "calc(100vh - 57px)", background: "#0A0908" }}>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="shorts-scroller"
        style={{
          height: "100%",
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {items.map((v, i) => {
          // 현재와 바로 다음 영상만 실제로 로드합니다.
          // 다음 걸 미리 띄워두기 때문에 넘겼을 때 곧바로 재생돼요.
          const mounted = i === index || i === index + 1;
          const isCurrent = i === index;
          const liked = likes.includes(v.videoId);
          const saved = savedVideos.some((x) => x.videoId === v.videoId);

          return (
            <div
              key={v.videoId}
              style={{
                height: "100%",
                scrollSnapAlign: "start",
                scrollSnapStop: "always",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  position: "relative",
                  height: "min(100%, 860px)",
                  aspectRatio: "9 / 16",
                  overflow: "hidden",
                  borderRadius: 14,
                  background: "#000",
                  maxWidth: "100%",
                }}
              >
                {mounted ? (
                  <iframe
                    ref={(el) => {
                      if (el) framesRef.current[v.videoId] = el;
                      else delete framesRef.current[v.videoId];
                    }}
                    src={`https://www.youtube.com/embed/${v.videoId}?autoplay=${isCurrent ? 1 : 0}&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&iv_load_policy=3`}
                    title={v.title}
                    allow="autoplay; encrypted-media"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      transform: "translateX(-50%)",
                      height: "100%",
                      width: "316%",
                      border: "none",
                      pointerEvents: "none",
                    }}
                  />
                ) : (
                  <img
                    src={v.thumbnail}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }}
                  />
                )}

                {isCurrent && (
                  <>
                    <div onClick={togglePlay} style={{ position: "absolute", inset: 0, cursor: "pointer" }} />

                    {!playing && (
                      <div
                        onClick={togglePlay}
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: "translate(-50%, -50%)",
                          width: 64,
                          height: 64,
                          borderRadius: "50%",
                          background: "rgba(0,0,0,0.6)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <Play size={28} color="#F2EDE4" fill="#F2EDE4" style={{ marginLeft: 3 }} />
                      </div>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMute();
                      }}
                      style={{
                        position: "absolute",
                        top: 14,
                        right: 14,
                        background: "rgba(0,0,0,0.55)",
                        border: "none",
                        color: "#F2EDE4",
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                  </>
                )}

                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 62,
                    bottom: 0,
                    padding: "40px 16px 18px",
                    background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
                    pointerEvents: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Avatar v={v} avatars={avatars} size={30} />
                    <span style={{ color: "#F2EDE4", fontSize: 13.5, fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>
                      {v.channelTitle}
                    </span>
                  </div>
                  <div
                    style={{
                      color: "#F2EDE4",
                      fontSize: 14,
                      lineHeight: 1.45,
                      fontFamily: "'Inter', sans-serif",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {v.title}
                  </div>
                  <div style={{ color: "#B8B2A4", fontSize: 12, marginTop: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {v.views ? `조회수 ${v.views}회` : ""}
                    {v.views && v.dur ? " · " : ""}
                    {v.dur || ""}
                  </div>
                </div>

                <div
                  style={{
                    position: "absolute",
                    right: 10,
                    bottom: 24,
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    alignItems: "center",
                  }}
                >
                  <ShortsButton
                    active={liked}
                    onClick={() => {
                      if (!liked) onTopicSignal(v.topic, 2);
                      onToggleLike(v.videoId);
                    }}
                    icon={ThumbsUp}
                    label="좋아요"
                    count={v.likeCount}
                  />
                  <ShortsButton
                    active={isCurrent && showComments}
                    onClick={() => setShowComments((c) => !c)}
                    icon={MessageCircle}
                    label="댓글"
                    count={v.commentCount}
                  />
                  <ShortsButton
                    active={saved}
                    onClick={() => {
                      if (!saved) onTopicSignal(v.topic, 2);
                      onToggleSave(v);
                    }}
                    icon={Bookmark}
                    label="저장"
                  />
                </div>
                {isCurrent && showComments && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: "75%",
                      background: "#141210",
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 16,
                      display: "flex",
                      flexDirection: "column",
                      boxShadow: "0 -8px 30px rgba(0,0,0,0.5)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 16px 10px",
                        borderBottom: "1px solid #231F19",
                      }}
                    >
                      <span style={{ color: "#F2EDE4", fontSize: 14, fontWeight: 600 }}>
                        댓글{v.commentCount ? ` ${v.commentCount}` : ""}
                      </span>
                      <button
                        onClick={() => setShowComments(false)}
                        style={{ background: "none", border: "none", color: "#8C8578", cursor: "pointer", display: "flex" }}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div style={{ overflowY: "auto", padding: "14px 16px 20px" }}>
                      <CommentList
                        videoId={v.videoId}
                        compact
                        onSeek={(seconds) => {
                          post(v.videoId, "seekTo", [seconds, true]);
                          post(v.videoId, "playVideo");
                          setPlaying(true);
                          setShowComments(false);
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          right: 26,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
        className="shorts-arrows"
      >
        <ArrowBtn onClick={() => scrollToIndex(index - 1)} disabled={index === 0} icon={ChevronUp} />
        <ArrowBtn onClick={() => scrollToIndex(index + 1)} disabled={index >= items.length - 1} icon={ChevronDown} />
      </div>

      <div
        style={{
          position: "absolute",
          left: 20,
          bottom: 18,
          color: "#5C574C",
          fontSize: 12,
          fontFamily: "'IBM Plex Mono', monospace",
          pointerEvents: "none",
        }}
      >
        {index + 1} / {items.length}
        {loadingMore && " · 불러오는 중"}
      </div>
    </div>
  );
}

function ShortsButton({ active, onClick, icon: Icon, label, count }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <button
        onClick={onClick}
        title={label}
        style={{
          background: active ? "#E8A33D" : "rgba(0,0,0,0.55)",
          color: active ? "#17140F" : "#F2EDE4",
          border: "none",
          width: 42,
          height: 42,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <Icon size={19} fill={active ? "#17140F" : "none"} />
      </button>
      {count && (
        <span style={{ color: "#F2EDE4", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
          {count}
        </span>
      )}
    </div>
  );
}

function ArrowBtn({ onClick, disabled, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "#231F19",
        border: "none",
        color: disabled ? "#3A342C" : "#F2EDE4",
        width: 40,
        height: 40,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <Icon size={20} />
    </button>
  );
}

// 채널 페이지. 배너·소개·영상 목록을 보여줍니다.
// 커뮤니티 글은 유튜브 공개 API에 없어서 넣을 수 없었어요.
function ChannelView({ channelId, onBack, onSelect, subscribed, onToggleSub, avatars, onOpenChannel }) {
  const [info, setInfo] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [bannerFailed, setBannerFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpanded(false);
    setBannerIdx(0);
    setBannerFailed(false);
    window.scrollTo({ top: 0 });

    Promise.all([fetchChannelInfo(channelId), fetchChannelVideos(channelId).catch(() => [])])
      .then(([channelInfo, channelVideos]) => {
        if (cancelled) return;
        if (!channelInfo) {
          setError("채널 정보를 찾지 못했어요.");
          return;
        }
        setInfo(channelInfo);
        setVideos(channelVideos);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "채널을 불러오지 못했어요.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#8C8578", padding: "120px 0", fontFamily: "'Inter', sans-serif" }}>
        <Loader2 size={18} className="spin" /> 채널을 불러오는 중이에요…
      </div>
    );
  }

  if (error || !info) {
    return (
      <div style={{ padding: "40px 28px" }}>
        <BackLink onClick={onBack} />
        <div style={{ color: "#B85C4F", textAlign: "center", padding: "80px 20px", fontSize: 13.5 }}>{error}</div>
      </div>
    );
  }

  const shortDesc = info.description.slice(0, 220);
  const hasMore = info.description.length > 220;

  return (
    <div style={{ padding: "20px 28px 60px", maxWidth: 1400, margin: "0 auto" }}>
      <BackLink onClick={onBack} />

      {(info.bannerSources || []).length > 0 && !bannerFailed && (
        <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 20, background: "#231F19" }}>
          <img
            src={info.bannerSources[bannerIdx]}
            alt=""
            onError={() => {
              if (bannerIdx < (info.bannerSources || []).length - 1) setBannerIdx((i) => i + 1);
              else setBannerFailed(true);
            }}
            style={{
              width: "100%",
              display: "block",
              // 배너 원본이 세로로 길어도 화면을 잡아먹지 않게 잘라냅니다.
              aspectRatio: "6.2 / 1",
              objectFit: "cover",
              objectPosition: "center",
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <FallbackImage
          sources={info.avatars || []}
          fallbackColor={colorForChannel(channelId)}
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            flexShrink: 0,
            objectFit: "cover",
            background: "#231F19",
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, color: "#F2EDE4" }}>
            {info.title}
          </div>
          <div
            style={{
              color: "#8C8578",
              fontSize: 12.5,
              marginTop: 6,
              fontFamily: "'IBM Plex Mono', monospace",
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {info.subscribers && <span>구독자 {info.subscribers}명</span>}
            {info.videoCount && <span>영상 {info.videoCount}개</span>}
            {info.totalViews && <span>총 조회수 {info.totalViews}회</span>}
          </div>

          {info.description && (
            <div style={{ color: "#B8B2A4", fontSize: 13.5, lineHeight: 1.6, marginTop: 12, whiteSpace: "pre-wrap" }}>
              {expanded ? info.description : shortDesc}
              {hasMore && !expanded && "…"}
              {hasMore && (
                <button
                  onClick={() => setExpanded((x) => !x)}
                  style={{
                    display: "block",
                    marginTop: 6,
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "#E8A33D",
                    fontSize: 12.5,
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {expanded ? "접기" : "더 보기"}
                </button>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onToggleSub}
          style={{
            background: subscribed ? "#2C271F" : "#E8A33D",
            color: subscribed ? "#B8B2A4" : "#17140F",
            border: "none",
            borderRadius: 20,
            padding: "10px 22px",
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: 13.5,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {subscribed ? "구독중" : "구독"}
        </button>
      </div>

      <div
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: 18,
          fontWeight: 600,
          color: "#F2EDE4",
          margin: "34px 0 16px",
        }}
      >
        영상
      </div>

      {videos.length === 0 ? (
        <div style={{ color: "#5C574C", padding: "40px 0", fontSize: 13 }}>영상을 불러오지 못했어요.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "28px 20px" }}>
          {videos.map((v) => (
            <VideoCard
              key={v.videoId}
              v={v}
              avatars={avatars}
              onClick={() => onSelect(v)}
              onOpenChannel={onOpenChannel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, hint, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        background: "none",
        border: "none",
        padding: "9px 10px",
        borderRadius: 8,
        cursor: "pointer",
        textAlign: "left",
        color: "#F2EDE4",
        fontFamily: "'Inter', sans-serif",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#1C1A16")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon size={15} style={{ marginTop: 2, flexShrink: 0, color: "#8C8578" }} />
      <span>
        <span style={{ fontSize: 12.5, display: "block" }}>{label}</span>
        {hint && <span style={{ fontSize: 10.5, color: "#5C574C", display: "block", marginTop: 2 }}>{hint}</span>}
      </span>
    </button>
  );
}

function BackLink({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "none",
        color: "#8C8578",
        fontFamily: "'Inter', sans-serif",
        fontSize: 13.5,
        cursor: "pointer",
        marginBottom: 18,
        padding: 0,
      }}
    >
      <ChevronLeft size={17} /> 뒤로
    </button>
  );
}

function PlayerView({
  v,
  onBack,
  onLoadCustom,
  related,
  subscribed,
  onToggleSub,
  liked,
  onToggleLike,
  saved,
  onToggleSave,
  avatars,
  onOpenChannel,
  slotRef,
  seekTo,
  onMinimize,
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [v.videoId]);

  // "복사됨!" 표시를 잠깐 띄웠다가 되돌립니다.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleShare = async () => {
    const link = `https://www.youtube.com/watch?v=${v.videoId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch (e) {
      // 클립보드 권한이 없거나 http 환경이면 직접 복사하도록 띄워줍니다.
      window.prompt("아래 링크를 복사하세요", link);
    }
  };

  return (
    <div style={{ padding: "20px 28px 60px", maxWidth: 1400, margin: "0 auto" }}>
      <button
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          color: "#8C8578",
          fontFamily: "'Inter', sans-serif",
          fontSize: 13.5,
          cursor: "pointer",
          padding: "6px 0 16px",
        }}
      >
        <ChevronLeft size={16} /> 목록으로
      </button>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        {/* minWidth를 0으로 둬야 팝업·분할 화면처럼 좁은 창에서 가로로 넘치지 않습니다. */}
        <div style={{ flex: "1 1 640px", minWidth: 0 }}>
          {/* 실제 플레이어는 App에서 한 번만 그려집니다.
              화면을 옮겨도 iframe이 사라지지 않아야 재생이 안 끊기거든요.
              여기는 그 플레이어가 놓일 자리만 잡아둡니다. */}
          <div
            ref={slotRef}
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16/9",
              borderRadius: 12,
              background: "#000",
            }}
          />

          <h1
            style={{
              fontFamily: "'Fraunces', serif",
              fontWeight: 600,
              fontSize: 22,
              color: "#F2EDE4",
              marginTop: 18,
              lineHeight: 1.3,
            }}
          >
            {v.title}
          </h1>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                onClick={() => onOpenChannel(v.channelId)}
                title="채널 보기"
                style={{ cursor: v.channelId ? "pointer" : "default", display: "flex" }}
              >
                <Avatar v={v} avatars={avatars} size={42} />
              </div>
              <div>
                <div
                  onClick={() => onOpenChannel(v.channelId)}
                  style={{
                    color: "#F2EDE4",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14.5,
                    fontWeight: 600,
                    cursor: v.channelId ? "pointer" : "default",
                  }}
                >
                  {v.channelTitle || "알 수 없는 채널"}
                </div>
                <div style={{ color: "#8C8578", fontSize: 12 }}>조회수 {v.views || "-"}회</div>
              </div>
              <button
                onClick={onToggleSub}
                style={{
                  marginLeft: 8,
                  background: subscribed ? "#2C271F" : "#E8A33D",
                  color: subscribed ? "#B8B2A4" : "#17140F",
                  border: "none",
                  borderRadius: 20,
                  padding: "9px 18px",
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                {subscribed ? "구독중" : "구독"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={onToggleLike}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: liked ? "#E8A33D" : "#231F19",
                  color: liked ? "#17140F" : "#F2EDE4",
                  border: "none",
                  borderRadius: 20,
                  padding: "9px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <ThumbsUp size={15} /> 좋아요{v.likeCount ? ` ${v.likeCount}` : ""}
              </button>
              <button
                onClick={handleShare}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: copied ? "#4A7A6B" : "#231F19",
                  color: "#F2EDE4",
                  border: "none",
                  borderRadius: 20,
                  padding: "9px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                  transition: "background 0.2s ease",
                }}
              >
                <Share2 size={15} /> {copied ? "복사됨!" : "공유"}
              </button>
              <button
                onClick={onToggleSave}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: saved ? "#E8A33D" : "#231F19",
                  color: saved ? "#17140F" : "#F2EDE4",
                  border: "none",
                  borderRadius: 20,
                  padding: "9px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <Bookmark size={15} fill={saved ? "#17140F" : "none"} /> {saved ? "저장됨" : "저장"}
              </button>
            </div>
          </div>

          {v.description && (
            <div
              style={{
                marginTop: 18,
                background: "#17140F",
                borderRadius: 10,
                padding: "14px 16px",
                color: "#B8B2A4",
                fontSize: 13.5,
                lineHeight: 1.6,
                fontFamily: "'Inter', sans-serif",
                whiteSpace: "pre-wrap",
                maxHeight: 140,
                overflow: "auto",
              }}
            >
              {v.description.slice(0, 400)}
              {v.description.length > 400 ? "…" : ""}
            </div>
          )}

          <div style={{ marginTop: 26 }}>
            <div
              style={{
                color: "#F2EDE4",
                fontFamily: "'Fraunces', serif",
                fontSize: 17,
                fontWeight: 600,
                marginBottom: 16,
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              댓글
              {v.commentCount && (
                <span style={{ color: "#8C8578", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 400 }}>
                  {v.commentCount}
                </span>
              )}
            </div>
            <CommentList videoId={v.videoId} onSeek={seekTo} />
          </div>
        </div>

        <div style={{ flex: "0 0 340px", minWidth: 280 }}>
          <div style={{ color: "#8C8578", fontFamily: "'Inter', sans-serif", fontSize: 12.5, marginBottom: 12, letterSpacing: 0.3 }}>
            다음 영상
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {related.map((r) => (
              <div key={r.videoId} style={{ display: "flex", gap: 10, cursor: "pointer" }} onClick={() => onLoadCustom(r.videoId, r)}>
                <div style={{ width: 140, flexShrink: 0 }}>
                  <Thumb v={r} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "#F2EDE4",
                      fontFamily: "'Fraunces', serif",
                      fontSize: 13,
                      lineHeight: 1.35,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {r.title}
                  </div>
                  <div style={{ color: "#8C8578", fontSize: 11.5, marginTop: 4 }}>{r.channelTitle}</div>
                  <div style={{ color: "#8C8578", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>{r.views}회</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { icon: Home, label: "홈" },
  { icon: Zap, label: "숏츠" },
  { icon: Users, label: "구독" },
  { icon: Bookmark, label: "보관함" },
];

export default function App() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [related, setRelated] = useState([]);
  const [avatars, setAvatars] = useState({});
  const [nextPageToken, setNextPageToken] = useState(null);
  const [shorts, setShorts] = useState([]);
  const [shortsIndex, setShortsIndex] = useState(0);
  const [shortsLoading, setShortsLoading] = useState(false);
  const [subFeed, setSubFeed] = useState([]);
  const [subChannels, setSubChannels] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [openChannel, setOpenChannel] = useState(null);
  // 미니 플레이어. 영상을 보다 나가도 재생을 이어가려고 iframe을 App에 두고 위치만 옮깁니다.
  const [minimized, setMinimized] = useState(false);
  const [slotRect, setSlotRect] = useState(null);
  const playerFrameRef = useRef(null);
  // 아래로 쓸어내려 접기. 손가락을 뗄 때까지의 이동량을 담아둡니다.
  const [dragY, setDragY] = useState(0);
  const dragStartRef = useRef(null);
  const slotRef = useRef(null);
  // 알림을 마지막으로 확인한 시각. 이 이후에 올라온 영상만 "새 영상"으로 셉니다.
  const [notifSeenAt, setNotifSeenAt] = useState(() => loadStore("loop:notifSeenAt", 0));
  const [loadingMore, setLoadingMore] = useState(false);
  // 지금 목록이 어디서 왔는지 기억해둡니다. 스크롤로 더 불러올 때 같은 곳에서 이어받으려고요.
  const [source, setSource] = useState({ kind: "home" });

  // 화면에 보이는 채널들의 프로필 사진을 한 번에 받아옵니다 (전체 1유닛).
  const loadAvatars = useCallback((list) => {
    const ids = list.map((v) => v.channelId).filter(Boolean);
    if (ids.length === 0) return;
    // 목록이 먼저 그려지도록 프로필 사진 요청은 한 박자 미룹니다.
    fetchChannelAvatars(ids)
      .then((map) => setAvatars((prev) => ({ ...prev, ...map })))
      .catch(() => {
        // 프로필 사진이 없어도 색상 원으로 대체되니 조용히 넘어갑니다.
      });
  }, []);
  const [navOpen, setNavOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("홈");

  // 구독 채널 ID, 저장한 영상, 좋아요 누른 영상 ID — 브라우저에 유지됩니다.
  const [subs, setSubs] = useState(() => loadStore("loop:subs", []));
  const [savedVideos, setSavedVideos] = useState(() => loadStore("loop:saved", []));
  const [likes, setLikes] = useState(() => loadStore("loop:likes", []));

  useEffect(() => saveStore("loop:subs", subs), [subs]);
  useEffect(() => saveStore("loop:saved", savedVideos), [savedVideos]);
  useEffect(() => saveStore("loop:likes", likes), [likes]);

  const toggleSub = (channelId) => {
    if (!channelId) return;
    setSubs((prev) => (prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]));
    // 구독 탭을 보고 있었다면 목록을 새로 맞춰줍니다.
    setSubFeed([]);
    setSubChannels([]);
  };

  const toggleLike = (videoId) => {
    setLikes((prev) => (prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId]));
  };

  const toggleSave = (video) => {
    setSavedVideos((prev) =>
      prev.some((s) => s.videoId === video.videoId)
        ? prev.filter((s) => s.videoId !== video.videoId)
        : [video, ...prev]
    );
  };

  // 홈: 인기 급상승 + 구독 채널 최신 영상. 검색을 안 써서 1~11유닛이면 끝납니다.
  const runHome = useCallback(async (channelIds) => {
    setLoading(true);
    setError(null);
    try {
      const { items, nextPageToken: token } = await fetchHome(channelIds);
      setVideos(items);
      setNextPageToken(token);
      setSource({ kind: "home" });
    } catch (e) {
      setError(e.message || "영상을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 카테고리 칩: 카테고리별 인기 영상 (1유닛)
  const runCategory = useCallback(async (categoryId) => {
    setLoading(true);
    setError(null);
    try {
      const { items, nextPageToken: token } = await fetchPopular("KR", "", categoryId);
      setVideos(items);
      setNextPageToken(token);
      setSource({ kind: "category", categoryId });
      if (items.length === 0) setError("이 카테고리에는 지금 보여줄 영상이 없어요.");
    } catch (e) {
      setError(e.message || "영상을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (q) => {
    setLoading(true);
    setError(null);
    try {
      // 1단계 결과가 오면 바로 그리고, 상세 정보는 도착하는 대로 덮어씁니다.
      const { items, nextPageToken: token } = await searchYoutube(q, "", (partial) => {
        setVideos(partial.items);
        setNextPageToken(partial.nextPageToken);
        setLoading(false);
      });
      setVideos(items);
      setNextPageToken(token);
      setSource({ kind: "search", query: q });
    } catch (e) {
      setError(e.message || "검색 중 문제가 생겼어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  const runShorts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 첫 묶음이 오면 바로 재생을 시작하고, 두 번째 주제는 뒤이어 붙습니다.
      const items = await fetchShorts((first) => {
        setShorts(first);
        setShortsIndex(0);
        setLoading(false);
        loadAvatars(first);
      });
      setShortsIndex(0);
      setShorts(items);
      loadAvatars(items);
      if (items.length === 0) setError("숏츠를 찾지 못했어요. 잠시 후 다시 시도해주세요.");
    } catch (e) {
      setError(e.message || "숏츠를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [loadAvatars]);

  // 끝이 가까워지면 숏츠를 더 모아둡니다.
  useEffect(() => {
    if (activeNav !== "숏츠" || shortsLoading) return;
    if (shorts.length === 0 || shortsIndex < shorts.length - 3) return;
    setShortsLoading(true);
    fetchShorts(undefined, shorts.map((v) => v.videoId))
      .then((more) => {
        setShorts((prev) => {
          const seen = new Set(prev.map((v) => v.videoId));
          const added = more.filter((v) => !seen.has(v.videoId));
          loadAvatars(added);
          return [...prev, ...added];
        });
      })
      .catch(() => {})
      .finally(() => setShortsLoading(false));
  }, [activeNav, shortsIndex, shorts, shortsLoading, loadAvatars]);

  // 구독 탭은 채널 목록을 보여줍니다. 영상 목록은 종 아이콘(알림)에서 따로 씁니다.
  const runSubscriptions = useCallback(async (channelIds) => {
    if (channelIds.length === 0) {
      setSubChannels([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchChannelsInfo(channelIds);
      // 구독한 순서대로 정렬합니다.
      const order = new Map(channelIds.map((id, i) => [id, i]));
      list.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      setSubChannels(list);
    } catch (e) {
      setError(e.message || "구독 채널을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 종 아이콘에 표시할 데이터를 미리 받아둡니다.
  // 채널 목록은 1시간 캐싱이라 대부분 요청 없이 캐시에서 나와요.
  useEffect(() => {
    if (subs.length === 0) {
      setSubFeed([]);
      return;
    }
    let cancelled = false;
    fetchSubscriptionFeed(subs)
      .then((items) => {
        if (!cancelled) setSubFeed(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [subs]);

  // 마지막 확인 이후 올라온 영상만 알림으로 셉니다.
  const newUploads = subFeed.filter((v) => new Date(v.publishedAt).getTime() > notifSeenAt);

  const openNotifications = () => {
    setShowNotifications((open) => {
      if (!open) {
        // 열 때 확인 시각을 갱신해서 배지를 지웁니다.
        const now = Date.now();
        setNotifSeenAt(now);
        saveStore("loop:notifSeenAt", now);
      }
      return !open;
    });
  };

  // 영상을 고르면 항상 펼친 상태로 엽니다.
  const openVideo = (v) => {
    setSelected(v);
    setMinimized(false);
    setOpenChannel(null);
  };

  const closePlayer = () => {
    setSelected(null);
    setMinimized(false);
    setDragY(0);
  };

  // 펼친 플레이어를 아래로 끌면 미니 플레이어로 접힙니다.
  const dragStart = (y) => {
    if (minimized) return;
    dragStartRef.current = y;
  };

  const dragMove = (y) => {
    if (dragStartRef.current == null) return;
    // 위로 올리는 건 무시하고 아래로 내리는 것만 따라갑니다.
    setDragY(Math.max(0, y - dragStartRef.current));
  };

  const dragEnd = () => {
    if (dragStartRef.current == null) return;
    dragStartRef.current = null;
    // 120px 넘게 내렸으면 접고, 아니면 제자리로 돌아옵니다.
    if (dragY > 120) setMinimized(true);
    setDragY(0);
  };

  // 접히거나 영상이 바뀌면 끌던 상태를 초기화합니다.
  useEffect(() => {
    setDragY(0);
    dragStartRef.current = null;
  }, [minimized, selected?.videoId]);

  const handleSubmitSearch = () => {
    if (!query.trim()) return;
    setOpenChannel(null);
    setSelected(null);
    setActiveNav("홈");
    setCategory("전체");
    runSearch(query.trim());
  };

  const handleCategoryClick = (c) => {
    setOpenChannel(null);
    setSelected(null);
    setActiveNav("홈");
    setCategory(c.label);
    if (c.id) runCategory(c.id);
    else runHome(subs);
  };

  const handleNavClick = (label) => {
    setActiveNav(label);
    setNavOpen(false);
    setSelected(null);
    setOpenChannel(null);
    if (label === "숏츠") {
      setError(null);
      if (shorts.length === 0) runShorts();
    } else if (label === "구독") {
      setError(null);
      runSubscriptions(subs);
    } else if (label === "보관함") {
      setError(null);
    } else {
      setCategory("전체");
      runHome(subs);
    }
  };

  // 안내 문구를 잠깐 띄웠다 지웁니다.
  const flash = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const clearSeenShorts = () => {
    saveStore("loop:seenShorts", []);
    flash("본 영상 기록을 지웠어요.");
  };

  const clearTopicScores = () => {
    saveStore("loop:topicScores", {});
    flash("숏츠 취향을 초기화했어요.");
  };

  // sessionStorage에 쌓인 API 응답 캐시만 비웁니다.
  // 구독·보관함·좋아요는 localStorage라 그대로 남아요.
  const clearCache = () => {
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("loop:"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch (e) {
      // 접근이 막혀 있으면 그냥 넘어갑니다.
    }
    flash("캐시를 비웠어요. 새로고침하면 최신 영상을 받아옵니다.");
  };

  // 펼친 상태에서는 PlayerView가 잡아둔 자리에 플레이어를 겹쳐 놓습니다.
  // 팝업·분할 화면으로 바뀔 때 창 크기가 급변하므로 ResizeObserver로 즉시 따라갑니다.
  useEffect(() => {
    if (!selected || minimized) {
      setSlotRect(null);
      return;
    }

    let frame = null;
    const measure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = slotRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        // 자리를 아직 못 잡았으면(너비 0) 그리지 않습니다.
        if (r.width < 10) return;
        setSlotRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    };

    measure();

    const ro = new ResizeObserver(measure);
    if (slotRef.current) ro.observe(slotRef.current);
    ro.observe(document.body);

    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [selected, minimized]);

  const playerCommand = useCallback((func, args = []) => {
    playerFrameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*"
    );
  }, []);

  // 댓글의 타임스탬프를 누르면 그 지점으로 이동합니다.
  const seekTo = useCallback(
    (seconds) => {
      playerCommand("seekTo", [seconds, true]);
      playerCommand("playVideo");
      if (!minimized) window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [playerCommand, minimized]
  );

  // 새로고침. 캐시를 비우고 지금 보고 있는 화면을 다시 불러옵니다.
  // 앱에는 브라우저 새로고침이 없어서 이 버튼이 그 역할을 해요.
  const refreshCurrent = useCallback(() => {
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("loop:"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch (e) {
      // 접근이 막혀 있으면 그냥 다시 불러옵니다.
    }

    setSelected(null);
    setOpenChannel(null);

    if (activeNav === "숏츠") {
      setShorts([]);
      setShortsIndex(0);
      runShorts();
    } else if (activeNav === "구독") {
      setSubChannels([]);
      runSubscriptions(subs);
    } else if (activeNav === "보관함") {
      // 저장 목록은 서버에서 받아오는 게 아니라 새로고침할 게 없습니다.
    } else if (source.kind === "search") {
      runSearch(source.query);
    } else if (source.kind === "category") {
      runCategory(source.categoryId);
    } else {
      runHome(subs);
    }
  }, [activeNav, source, subs, runShorts, runSubscriptions, runSearch, runCategory, runHome]);

  // ── 브라우저 뒤로가기 ──────────────────────────────────
  // 지금 화면 상태를 ref에 담아둡니다. popstate 핸들러가 오래된 값을 보지 않도록요.
  const navStateRef = useRef(null);
  navStateRef.current = {
    openChannel,
    selected,
    activeNav,
    showNotifications,
    showMenu,
    minimized,
    source,
    handleNavClick,
    goHome: () => {
      setQuery("");
      setCategory("전체");
      setActiveNav("홈");
      runHome(subs);
    },
  };

  useEffect(() => {
    // 앱에 머무를 수 있도록 가짜 히스토리 항목을 하나 쌓아둡니다.
    window.history.pushState({ loop: 1 }, "");

    const onPop = () => {
      const state = navStateRef.current;
      let handled = true;

      if (state.showMenu) {
        setShowMenu(false);
      } else if (state.showNotifications) {
        setShowNotifications(false);
      } else if (state.openChannel) {
        setOpenChannel(null);
      } else if (state.selected && !state.minimized) {
        // 유튜브처럼 뒤로가기는 먼저 작은 창으로 접습니다.
        setMinimized(true);
      } else if (state.selected) {
        closePlayer();
      } else if (state.activeNav !== "홈") {
        state.handleNavClick("홈");
      } else if (state.source?.kind !== "home") {
        // 검색 결과나 카테고리를 보고 있으면 홈 목록으로 되돌립니다.
        state.goHome();
      } else {
        // 이미 홈이면 앱을 벗어나도록 그냥 둡니다.
        handled = false;
      }

      // 아직 앱 안이면 항목을 다시 쌓아 다음 뒤로가기도 받을 수 있게 합니다.
      if (handled) window.history.pushState({ loop: 1 }, "");
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // 보관함일 땐 API를 부르지 않고 저장된 목록을 그대로 보여줍니다.
  const displayList =
    activeNav === "보관함" ? savedVideos : videos;

  useEffect(() => {
    // 목록이 화면에 그려진 뒤에 프로필 사진을 요청합니다.
    const t = setTimeout(() => loadAvatars(displayList), 300);
    return () => clearTimeout(t);
  }, [displayList, loadAvatars]);

  // 스크롤이 목록 끝에 닿으면 다음 페이지를 이어붙입니다.
  // 보관함은 저장된 것만 보여주므로 더 불러올 게 없습니다.
  const loadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore || loading || activeNav === "보관함") return;
    setLoadingMore(true);
    try {
      const res =
        source.kind === "search"
          ? await searchYoutube(source.query, nextPageToken)
          : await fetchPopular("KR", nextPageToken, source.categoryId || null);
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.videoId));
        return [...prev, ...res.items.filter((v) => !seen.has(v.videoId))];
      });
      setNextPageToken(res.nextPageToken);
    } catch (e) {
      // 더 불러오기 실패는 기존 목록을 건드리지 않고 조용히 멈춥니다.
      setNextPageToken(null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextPageToken, loadingMore, loading, activeNav, source]);

  const sentinelRef = useRef(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  // 재생 중인 영상의 채널에서 다른 영상을 가져와 무작위로 추천합니다.
  // 채널 단위로 캐싱되니 같은 채널 영상을 여러 개 열어도 API는 한 번만 나갑니다.
  useEffect(() => {
    if (!selected) {
      setRelated([]);
      return;
    }
    let cancelled = false;
    // 채널 영상은 이미 50개까지 받아둔 상태라 개수를 늘려도 추가 요청이 없습니다.
    const RELATED_MAX = 24;
    const fallback = () =>
      shuffle(displayList.filter((x) => x.videoId !== selected.videoId)).slice(0, RELATED_MAX);

    (async () => {
      if (!selected.channelId) {
        if (!cancelled) setRelated(fallback());
        return;
      }
      loadAvatars([selected]);
      try {
        const channelVideos = await fetchChannelVideos(selected.channelId);
        if (cancelled) return;
        // 같은 채널 영상을 먼저 채우고, 모자라면 현재 목록에서 이어붙입니다.
        const picks = shuffle(channelVideos.filter((x) => x.videoId !== selected.videoId)).slice(0, RELATED_MAX);
        if (picks.length < RELATED_MAX) {
          const ids = new Set([selected.videoId, ...picks.map((p) => p.videoId)]);
          picks.push(
            ...shuffle(displayList.filter((x) => !ids.has(x.videoId))).slice(0, RELATED_MAX - picks.length)
          );
        }
        setRelated(picks);
        loadAvatars(picks);
      } catch (e) {
        if (!cancelled) setRelated(fallback());
      }
    })();

    return () => {
      cancelled = true;
    };
    // displayList는 의도적으로 제외 — 목록이 바뀔 때마다 추천을 다시 뽑지 않기 위해서입니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div style={{ minHeight: "100vh", background: "#0E0D0B", fontFamily: "'Inter', sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 24px",
          background: "rgba(14,13,11,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid #231F19",
        }}
      >
        <button
          onClick={() => setNavOpen(!navOpen)}
          style={{ background: "none", border: "none", color: "#F2EDE4", cursor: "pointer", display: "flex" }}
          className="mobile-only"
        >
          {navOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <div
          onClick={() => {
            setQuery("");
            handleNavClick("홈");
          }}
          title="홈으로"
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}
        >
          <div
            style={{
              width: 30,
              height: 22,
              borderRadius: 4,
              background: "#E8A33D",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Play size={12} color="#0E0D0B" fill="#0E0D0B" style={{ marginLeft: 1 }} />
          </div>
          <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, color: "#F2EDE4", letterSpacing: -0.5 }}>
            우진
          </span>
        </div>

        <div
          style={{
            flex: 1,
            maxWidth: 560,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            background: "#17140F",
            border: "1px solid #2C271F",
            borderRadius: 22,
            padding: "8px 16px",
            gap: 10,
          }}
        >
          <Search size={16} color="#8C8578" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmitSearch()}
            placeholder="영상, 채널 검색"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "#F2EDE4",
              fontSize: 13.5,
              fontFamily: "'Inter', sans-serif",
            }}
          />
        </div>

        <button
          onClick={refreshCurrent}
          title="새로고침"
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            padding: 4,
            display: "flex",
            cursor: loading ? "default" : "pointer",
            color: loading ? "#3A342C" : "#B8B2A4",
            flexShrink: 0,
          }}
        >
          <RotateCcw size={18} className={loading ? "spin" : undefined} />
        </button>

        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={openNotifications}
            title="구독 채널 새 영상"
            style={{
              background: "none",
              border: "none",
              padding: 4,
              display: "flex",
              cursor: "pointer",
              color: showNotifications ? "#E8A33D" : "#B8B2A4",
            }}
          >
            <Bell size={19} />
          </button>

          {/* 새 영상이 있으면 빨간 점 */}
          {newUploads.length > 0 && !showNotifications && (
            <span
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                minWidth: 15,
                height: 15,
                padding: "0 4px",
                borderRadius: 8,
                background: "#B85C4F",
                color: "#F2EDE4",
                fontSize: 9.5,
                fontFamily: "'IBM Plex Mono', monospace",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              {newUploads.length > 9 ? "9+" : newUploads.length}
            </span>
          )}

          {showNotifications && (
            <>
              {/* 바깥을 누르면 닫힙니다 */}
              <div
                onClick={() => setShowNotifications(false)}
                style={{ position: "fixed", inset: 0, zIndex: 40 }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 34,
                  right: 0,
                  width: 320,
                  maxHeight: 420,
                  overflowY: "auto",
                  background: "#141210",
                  border: "1px solid #231F19",
                  borderRadius: 12,
                  boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                  zIndex: 41,
                  padding: 8,
                }}
              >
                <div
                  style={{
                    padding: "8px 10px 12px",
                    color: "#F2EDE4",
                    fontSize: 13.5,
                    fontWeight: 600,
                    borderBottom: "1px solid #231F19",
                    marginBottom: 6,
                  }}
                >
                  구독 채널 새 영상
                </div>

                {subs.length === 0 ? (
                  <div style={{ color: "#5C574C", fontSize: 12.5, padding: "18px 10px", lineHeight: 1.5 }}>
                    구독한 채널이 없어요.
                    <br />
                    영상을 열고 구독을 눌러보세요.
                  </div>
                ) : subFeed.length === 0 ? (
                  <div style={{ color: "#5C574C", fontSize: 12.5, padding: "18px 10px" }}>새 영상이 없어요.</div>
                ) : (
                  subFeed.slice(0, 12).map((v) => (
                    <div
                      key={v.videoId}
                      onClick={() => {
                        openVideo(v);
                        setShowNotifications(false);
                      }}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: 8,
                        borderRadius: 8,
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#1C1A16")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <img
                        src={v.thumbnail}
                        alt=""
                        style={{ width: 76, height: 43, objectFit: "cover", borderRadius: 5, flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            color: "#F2EDE4",
                            fontSize: 12.5,
                            lineHeight: 1.35,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {v.title}
                        </div>
                        <div
                          style={{
                            color: "#8C8578",
                            fontSize: 11,
                            marginTop: 3,
                            fontFamily: "'IBM Plex Mono', monospace",
                          }}
                        >
                          {v.channelTitle} · {v.time}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowMenu((m) => !m)}
            title="설정"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#E8A33D",
              border: showMenu ? "2px solid #F2EDE4" : "none",
              cursor: "pointer",
              padding: 0,
            }}
          />

          {showMenu && (
            <>
              <div onClick={() => setShowMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div
                style={{
                  position: "absolute",
                  top: 40,
                  right: 0,
                  width: 268,
                  background: "#141210",
                  border: "1px solid #231F19",
                  borderRadius: 12,
                  boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                  zIndex: 41,
                  padding: 8,
                }}
              >
                <div style={{ padding: "8px 10px 12px", borderBottom: "1px solid #231F19", marginBottom: 6 }}>
                  <div style={{ color: "#F2EDE4", fontSize: 13.5, fontWeight: 600 }}>내 기록</div>
                  <div
                    style={{
                      color: "#8C8578",
                      fontSize: 11.5,
                      marginTop: 4,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    구독 {subs.length} · 저장 {savedVideos.length} · 좋아요 {likes.length}
                  </div>
                </div>

                <MenuItem
                  icon={RotateCcw}
                  label="숏츠 취향 초기화"
                  hint="좋아요·건너뛰기로 쌓인 선호도를 지웁니다"
                  onClick={() => {
                    clearTopicScores();
                    setShowMenu(false);
                  }}
                />
                <MenuItem
                  icon={Trash2}
                  label="본 영상 기록 지우기"
                  hint="숏츠에서 봤던 영상이 다시 나옵니다"
                  onClick={() => {
                    clearSeenShorts();
                    setShowMenu(false);
                  }}
                />
                <MenuItem
                  icon={RotateCcw}
                  label="캐시 비우기"
                  hint="최신 영상을 새로 받아옵니다"
                  onClick={() => {
                    clearCache();
                    setShowMenu(false);
                  }}
                />

                <div
                  style={{
                    color: "#3A342C",
                    fontSize: 10.5,
                    padding: "10px 10px 4px",
                    borderTop: "1px solid #231F19",
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  구독·보관함은 이 브라우저에만 저장됩니다.
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex" }}>
        <div
          style={{ width: 150, flexShrink: 0, padding: "20px 12px" }}
          className={navOpen ? "sidebar sidebar-open" : "sidebar"}
        >
          {NAV_ITEMS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              onClick={() => handleNavClick(label)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 14px",
                borderRadius: 8,
                cursor: "pointer",
                background: activeNav === label ? "#231F19" : "transparent",
                color: activeNav === label ? "#E8A33D" : "#B8B2A4",
                marginBottom: 2,
                fontSize: 13.5,
                fontWeight: 500,
              }}
            >
              <Icon size={18} />
              {label}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {openChannel ? (
            <ChannelView
              channelId={openChannel}
              onBack={() => setOpenChannel(null)}
              onSelect={(v) => openVideo(v)}
              subscribed={subs.includes(openChannel)}
              onToggleSub={() => toggleSub(openChannel)}
              avatars={avatars}
              onOpenChannel={(id) => setOpenChannel(id)}
            />
          ) : activeNav === "숏츠" && (!selected || minimized) ? (
            loading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  color: "#8C8578",
                  padding: "120px 0",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <Loader2 size={18} className="spin" /> 숏츠를 모으는 중이에요…
              </div>
            ) : error ? (
              <div style={{ color: "#B85C4F", textAlign: "center", padding: "120px 20px", fontSize: 13.5 }}>{error}</div>
            ) : (
              <ShortsView
                items={shorts}
                index={shortsIndex}
                setIndex={setShortsIndex}
                onExit={() => handleNavClick("홈")}
                avatars={avatars}
                likes={likes}
                onToggleLike={toggleLike}
                savedVideos={savedVideos}
                onToggleSave={toggleSave}
                loadingMore={shortsLoading}
                onTopicSignal={bumpTopicScore}
              />
            )
          ) : selected && !minimized ? (
            <PlayerView
              v={selected}
              related={related}
              onBack={() => setMinimized(true)}
              onMinimize={() => setMinimized(true)}
              slotRef={slotRef}
              seekTo={seekTo}
              subscribed={subs.includes(selected.channelId)}
              onToggleSub={() => toggleSub(selected.channelId)}
              liked={likes.includes(selected.videoId)}
              onToggleLike={() => toggleLike(selected.videoId)}
              saved={savedVideos.some((s) => s.videoId === selected.videoId)}
              onToggleSave={() => toggleSave(selected)}
              avatars={avatars}
              onOpenChannel={(id) => {
                if (id) setOpenChannel(id);
              }}
              onLoadCustom={(videoId, fullVideo) => {
                if (fullVideo) {
                  openVideo(fullVideo);
                } else {
                  openVideo({ videoId, title: "직접 불러온 영상", channelTitle: "", views: "", description: "" });
                }
              }}
            />
          ) : (
            <div style={{ padding: "20px 28px 60px" }}>
              {activeNav === "구독" ? (
                <div
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontSize: 19,
                    fontWeight: 600,
                    color: "#F2EDE4",
                    paddingBottom: 18,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  구독
                  <span style={{ color: "#8C8578", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 400 }}>
                    채널 {subs.length}개
                  </span>
                </div>
              ) : activeNav === "보관함" ? (
                <div
                  style={{
                    fontFamily: "'Fraunces', serif",
                    fontSize: 19,
                    fontWeight: 600,
                    color: "#F2EDE4",
                    paddingBottom: 18,
                  }}
                >
                  보관함
                  <span style={{ color: "#8C8578", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, marginLeft: 10 }}>
                    {savedVideos.length}개
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 18 }}>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => handleCategoryClick(c)}
                      style={{
                        flexShrink: 0,
                        padding: "8px 16px",
                        borderRadius: 18,
                        border: "1px solid " + (category === c.label ? "#E8A33D" : "#2C271F"),
                        background: category === c.label ? "#E8A33D" : "transparent",
                        color: category === c.label ? "#17140F" : "#B8B2A4",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "'Inter', sans-serif",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}

              {loading && activeNav !== "보관함" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: "#8C8578",
                    padding: "80px 0",
                    justifyContent: "center",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <Loader2 size={18} className="spin" /> 유튜브에서 영상을 불러오는 중이에요…
                </div>
              )}

              {!loading && error && activeNav !== "보관함" && (
                <div style={{ color: "#B85C4F", textAlign: "center", padding: "80px 20px", fontFamily: "'Inter', sans-serif", fontSize: 13.5 }}>
                  {error}
                  <div style={{ color: "#8C8578", fontSize: 12, marginTop: 8 }}>
                    서버에 API 키가 설정되어 있는지, YouTube Data API v3가 활성화되어 있는지 확인해주세요.
                  </div>
                </div>
              )}

              {activeNav === "구독" && !loading && !error && (
                subChannels.length === 0 ? (
                  <div style={{ color: "#5C574C", textAlign: "center", padding: "80px 0", fontFamily: "'Inter', sans-serif" }}>
                    구독한 채널이 없어요. 영상을 열고 구독을 눌러보세요.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                    {subChannels.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setOpenChannel(c.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          padding: 14,
                          borderRadius: 12,
                          border: "1px solid #231F19",
                          cursor: "pointer",
                          minWidth: 0,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#1C1A16")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <FallbackImage
                          sources={c.avatars}
                          fallbackColor={colorForChannel(c.id)}
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: "50%",
                            flexShrink: 0,
                            objectFit: "cover",
                            background: "#231F19",
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              color: "#F2EDE4",
                              fontSize: 14,
                              fontWeight: 600,
                              fontFamily: "'Inter', sans-serif",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {c.title}
                          </div>
                          <div
                            style={{
                              color: "#8C8578",
                              fontSize: 11.5,
                              marginTop: 4,
                              fontFamily: "'IBM Plex Mono', monospace",
                            }}
                          >
                            {c.subscribers ? `구독자 ${c.subscribers}명` : ""}
                            {c.subscribers && c.videoCount ? " · " : ""}
                            {c.videoCount ? `영상 ${c.videoCount}개` : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {activeNav !== "구독" && !loading && !error && displayList.length === 0 && (
                <div style={{ color: "#8C8578", textAlign: "center", padding: "80px 0", fontFamily: "'Inter', sans-serif" }}>
                  {activeNav === "보관함"
                    ? "저장한 영상이 아직 없어요. 영상을 열고 저장을 눌러보세요."
                    : "검색 결과가 없어요."}
                </div>
              )}

              {activeNav !== "구독" && !loading && !error && displayList.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "28px 20px" }}>
                  {displayList.map((v) => (
                    <VideoCard
                      key={v.videoId}
                      v={v}
                      avatars={avatars}
                      onClick={() => openVideo(v)}
                      onOpenChannel={(id) => setOpenChannel(id)}
                    />
                  ))}
                </div>
              )}

              {activeNav !== "보관함" && activeNav !== "구독" && !loading && !error && (
                <div ref={sentinelRef} style={{ height: 1 }} />
              )}

              {loadingMore && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    color: "#8C8578",
                    padding: "36px 0",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                  }}
                >
                  <Loader2 size={16} className="spin" /> 더 불러오는 중…
                </div>
              )}

              {!loadingMore && !nextPageToken && !loading && !error && displayList.length > 0 && activeNav !== "보관함" && activeNav !== "구독" && (
                <div style={{ textAlign: "center", color: "#5C574C", padding: "36px 0", fontSize: 12.5, fontFamily: "'Inter', sans-serif" }}>
                  마지막 영상이에요
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 영상 플레이어. 화면을 옮겨도 이 iframe은 그대로 살아 있어서 재생이 안 끊깁니다.
          펼친 상태에선 PlayerView가 잡아둔 자리에, 접으면 오른쪽 아래 작은 창으로 갑니다. */}
      {selected && (minimized || slotRect) && (
        <div
          style={
            minimized
              ? {
                  position: "fixed",
                  right: 16,
                  bottom: 16,
                  // 유튜브 정책상 임베드 플레이어는 200x200px 아래로 줄이면 안 됩니다.
                  // 좁은 창(팝업·분할 화면)에서도 넘치지 않게 합니다.
                  // 다만 유튜브 정책상 200x200px 아래로는 줄이지 않습니다.
                  width: "max(360px, min(360px, calc(100vw - 32px)))",
                  height: 202,
                  maxWidth: "calc(100vw - 32px)",
                  minWidth: 200,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#000",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.65)",
                  border: "1px solid #2C271F",
                  zIndex: 70,
                }
              : {
                  position: "fixed",
                  top: slotRect.top,
                  left: slotRect.left,
                  width: slotRect.width,
                  height: slotRect.height,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#000",
                  zIndex: 20,
                  // 끌어내린 만큼 따라 움직이고, 내려갈수록 살짝 작아지며 흐려집니다.
                  transform: dragY ? `translateY(${dragY}px) scale(${Math.max(0.82, 1 - dragY / 900)})` : undefined,
                  transformOrigin: "bottom right",
                  opacity: dragY ? Math.max(0.55, 1 - dragY / 500) : 1,
                  transition: dragStartRef.current == null ? "transform 0.22s ease, opacity 0.22s ease" : "none",
                }
          }
        >
          {/* 위쪽 띠를 잡고 아래로 쓸어내리면 접힙니다.
              플레이어 컨트롤을 가리지 않도록 상단 일부만 차지해요. */}
          {!minimized && (
            <div
              onTouchStart={(e) => dragStart(e.touches[0].clientY)}
              onTouchMove={(e) => dragMove(e.touches[0].clientY)}
              onTouchEnd={dragEnd}
              onMouseDown={(e) => dragStart(e.clientY)}
              onMouseMove={(e) => dragStartRef.current != null && dragMove(e.clientY)}
              onMouseUp={dragEnd}
              onMouseLeave={dragEnd}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 46,
                zIndex: 2,
                cursor: dragStartRef.current != null ? "grabbing" : "grab",
                touchAction: "none",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                paddingTop: 7,
              }}
            >
              {/* 끌 수 있다는 걸 알려주는 손잡이 */}
              <div
                style={{
                  width: 38,
                  height: 4,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.35)",
                  opacity: dragY ? 0.9 : 0.5,
                }}
              />
            </div>
          )}

          <iframe
            key={selected.videoId}
            ref={playerFrameRef}
            src={`https://www.youtube.com/embed/${selected.videoId}?rel=0&enablejsapi=1&autoplay=1`}
            title={selected.title}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
            allowFullScreen
          />

          {minimized && (
            <>
              {/* 작은 창을 누르면 다시 펼칩니다 */}
              <div
                onClick={() => setMinimized(false)}
                style={{ position: "absolute", inset: 0, cursor: "pointer" }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closePlayer();
                }}
                title="닫기"
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.65)",
                  border: "none",
                  color: "#F2EDE4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={15} />
              </button>
            </>
          )}
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 26,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#231F19",
            color: "#F2EDE4",
            padding: "11px 18px",
            borderRadius: 22,
            fontSize: 12.5,
            fontFamily: "'Inter', sans-serif",
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
            zIndex: 60,
          }}
        >
          {toast}
        </div>
      )}

      <style>{`
        * { box-sizing: border-box; }
        input::placeholder { color: #5C574C; }
        .shorts-scroller { scrollbar-width: none; }
        .shorts-scroller::-webkit-scrollbar { display: none; }
        .mobile-only { display: none !important; }
        @media (max-width: 720px) {
          .sidebar { display: none !important; }
          .mobile-only { display: flex !important; }
          .shorts-arrows { display: none !important; }
          .sidebar-open {
            display: block !important;
            position: fixed;
            top: 57px;
            left: 0;
            bottom: 0;
            width: 180px;
            background: #0E0D0B;
            border-right: 1px solid #231F19;
            z-index: 30;
          }
        }
        ::-webkit-scrollbar { height: 6px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: #2C271F; border-radius: 4px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
