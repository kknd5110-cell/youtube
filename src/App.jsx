import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { Search, Home, Bell, Play, ChevronLeft, ThumbsUp, Share2, Bookmark, Menu, X, Loader2, Zap, Volume2, VolumeX, ChevronUp, ChevronDown, MessageCircle, Users, Trash2, RotateCcw, Maximize2, Minimize2, RotateCw, Pause, Volume1, Subtitles, Gauge, SkipBack, SkipForward, Clock, ListPlus, ListVideo, Settings } from "lucide-react";

// API 키는 서버(api/youtube.js)에만 있습니다. 이 파일에는 키가 들어가지 않아요.
// 유튜브 API 호출을 프록시 경유로 바꿔주는 헬퍼입니다.
// 웹에서는 같은 서버의 /api/youtube를 그대로 부릅니다.
// 앱(Capacitor)으로 감싸면 폰 안에 서버가 없으므로, 배포된 주소를 VITE_API_BASE로 지정해요.
const API_BASE = import.meta.env.VITE_API_BASE || "";

async function ytFetch(endpoint, params, retries = 2) {
  const search = new URLSearchParams({ endpoint, ...params });
  const url = `${API_BASE}/api/youtube?${search.toString()}`;

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        // 쿼터 초과·잘못된 요청은 다시 시도해도 같으니 바로 알립니다.
        throw new Error(data.error.message || "유튜브 API 호출에 실패했어요.");
      }
      return data;
    } catch (e) {
      lastError = e;
      // 서버가 준 오류 메시지는 재시도 대상이 아닙니다.
      if (e.message && !e.message.includes("Failed to fetch") && !e.message.includes("JSON")) {
        throw e;
      }
      // 앱을 막 켰을 때는 네트워크가 아직 안 잡혀 첫 요청이 실패하곤 합니다.
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastError || new Error("서버에 연결하지 못했어요.");
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
  // 여행(19)은 뺐습니다. 유튜브 인기 급상승 API가 한국 지역에서 이 카테고리를
  // 지원하지 않아 요청하면 오류가 납니다. 칸을 누르면 에러가 나는 건 물론이고,
  // 홈이 카테고리 두 개를 무작위로 뽑아 쓰기 때문에 홈까지 부실해졌어요.
  { label: "테크", id: "28" },
  { label: "요리", id: "26" },
  { label: "동물", id: "15" },
  { label: "뉴스", id: "25" },
];

// 연결 끊김을 감지하려고 같이 재생하는 아주 짧은 무음 소리입니다.
const SILENT_SOUND = "data:audio/wav;base64,UklGRgQCAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YeABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=";

// 컨트롤 바 위에 뜨는 작은 메뉴의 공통 모양
const menuBoxStyle = {
  animation: "riseIn 200ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
  position: "absolute",
  bottom: 44,
  right: 0,
  background: "#141210",
  border: "1px solid #2C271F",
  borderRadius: 10,
  padding: 6,
  minWidth: 118,
  maxHeight: 260,
  overflowY: "auto",
  boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
  zIndex: 6,
};

const menuItemStyle = (active) => ({
  display: "block",
  width: "100%",
  background: active ? "#2C271F" : "none",
  border: "none",
  borderRadius: 6,
  color: active ? "#E8A33D" : "#F2EDE4",
  padding: "7px 10px",
  fontSize: 12.5,
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
  whiteSpace: "nowrap",
});

// ── 움직임 기준 ────────────────────────────────────────────
// 앱 전체가 같은 속도·곡선으로 움직이도록 한곳에 모아둡니다.
// cubic-bezier는 처음에 빠르게 나가고 끝에서 부드럽게 멈추는 곡선이에요.
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const MOTION = {
  // 버튼 색·투명도처럼 작은 변화
  fast: `120ms ${EASE}`,
  // 카드가 떠오르거나 메뉴가 열리는 정도
  base: `220ms ${EASE}`,
  // 플레이어가 접히고 펼쳐지는 큰 움직임
  slow: `320ms ${EASE}`,
};

const AVATAR_COLORS = ["#E8A33D", "#4A7A6B", "#B85C4F", "#8C7A5E", "#5C7A9E", "#9E5C8F"];

// localStorage 읽기/쓰기. 브라우저 설정에 따라 접근이 막힐 수 있어서 항상 try로 감쌉니다.
// 같은 값을 반복해서 읽을 때 JSON 해석을 건너뛰기 위한 캐시입니다.
const storeCache = new Map();

function loadStore(key, fallback) {
  if (storeCache.has(key)) return storeCache.get(key);
  const value = loadStoreRaw(key, fallback);
  storeCache.set(key, value);
  return value;
}

function loadStoreRaw(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveStore(key, value) {
  storeCache.set(key, value);
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

// 홈 피드용 정리.
// 1) 3분 이하 영상은 길이만 보고 전부 뺍니다 (숏츠는 전용 탭에서 봐요).
// 2) 조회수가 적은 음악 영상은 홈에 안 띄웁니다. 검색하면 그대로 나옵니다.
const MUSIC_MIN_VIEWS = 5000000;
// 음악 영상이 홈을 채우지 않도록 개수 자체를 제한합니다.
const MUSIC_MAX_COUNT = 2;

function tidyForHome(list, floor = 8) {
  let musicShown = 0;
  const keep = list.filter((v) => {
    if (v.seconds && v.seconds <= SHORTS_MAX_SECONDS) return false;
    if (v.categoryId === MUSIC_CATEGORY_ID) {
      // 아주 유명한 곡만, 그것도 몇 개까지만 보여줍니다.
      if (v.viewCount != null && v.viewCount < MUSIC_MIN_VIEWS) return false;
      if (musicShown >= MUSIC_MAX_COUNT) return false;
      musicShown += 1;
    }
    return true;
  });
  // 너무 많이 빠져서 화면이 휑해지면 뺀 것 중 일부를 되돌립니다.
  if (keep.length >= floor) return keep;
  const rest = list.filter((v) => !keep.includes(v));
  return [...keep, ...rest.slice(0, floor - keep.length)];
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
    viewCount: details?.statistics?.viewCount ? Number(details.statistics.viewCount) : null,
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
// order: relevance(관련순) | viewCount(인기순) | date(최신순)
async function searchYoutube(query, pageToken = "", onPartial, order = "relevance") {
  const cacheKey = `loop:search:${query}:${order}:${pageToken}`;
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
    order,
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

  // 검색 결과는 절대 섞지 않습니다.
  // 관련순은 유튜브가 "이게 제일 잘 맞는다"고 정해서 보내주는 순서예요.
  // 예전에는 지루하지 말라고 여기서 섞었는데, 그러면 정확히 찾던 영상이
  // 뒤로 밀려나서 "검색이 안 된다"처럼 보입니다. 순서가 곧 답입니다.
  const arrange = (list) => list;

  // 1단계: 재생시간·조회수 없이 먼저 그립니다.
  if (onPartial) {
    onPartial({
      items: arrange(unique.map((it) => toVideo(it.snippet, null, it.id.videoId))),
      nextPageToken,
    });
  }

  // 2단계: 상세 정보를 채웁니다.
  const detailsById = await fetchVideoDetails(unique.map((it) => it.id.videoId));
  const result = {
    items: arrange(
      withoutShorts(
        unique
          .filter((it) => detailsById[it.id.videoId])
          .map((it) => toVideo(it.snippet, detailsById[it.id.videoId], it.id.videoId))
      )
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
// 채널의 업로드 목록. pageToken을 넘기면 다음 장을 이어서 받습니다.
// 채널 영상을 조회수 높은 순으로 가져옵니다.
// 업로드 재생목록은 올린 순서대로만 주기 때문에 인기순은 검색으로 받아야 합니다.
// 검색은 한 번에 100유닛이라 업로드 목록(2유닛)보다 훨씬 비쌉니다. 그래서 1시간 담아둡니다.
async function fetchChannelVideosPopular(channelId, pageToken = "") {
  return withCache(
    `loop:channelpop:${channelId}:${pageToken}`,
    async () => {
      const data = await ytFetch("search", {
        part: "snippet",
        channelId,
        order: "viewCount",
        type: "video",
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      });

      const items = (data.items || []).filter((it) => it.id?.videoId);
      if (items.length === 0) return { items: [], nextPageToken: null };

      const ids = items.map((it) => it.id.videoId);
      const detailsById = await fetchVideoDetails(ids);
      return {
        items: items
          .filter((it) => detailsById[it.id.videoId])
          .map((it) => toVideo(it.snippet, detailsById[it.id.videoId], it.id.videoId)),
        nextPageToken: data.nextPageToken || null,
      };
    },
    60 * 60 * 1000
  );
}

async function fetchChannelVideos(channelId, pageToken = "") {
  const res = await withCache(
    `loop:channel:${channelId}:${pageToken}`,
    async () => {
      // 1) 채널의 "업로드" 재생목록 ID를 찾습니다.
      const chData = await ytFetch("channels", { part: "contentDetails", id: channelId });
      const uploadsId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsId) return { items: [], nextPageToken: null };

      const plData = await ytFetch("playlistItems", {
        part: "snippet",
        playlistId: uploadsId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      });

      const items = (plData.items || []).filter((it) => it.snippet?.resourceId?.videoId);
      if (items.length === 0) return { items: [], nextPageToken: null };

      const ids = items.map((it) => it.snippet.resourceId.videoId);
      const detailsById = await fetchVideoDetails(ids);
      return {
        items: items
          .filter((it) => detailsById[it.snippet.resourceId.videoId])
          .map((it) => {
            const vid = it.snippet.resourceId.videoId;
            // playlistItems의 channelTitle은 재생목록 소유자라서 영상 채널명으로 보정합니다.
            return toVideo(
              {
                ...it.snippet,
                channelId,
                channelTitle: it.snippet.videoOwnerChannelTitle || it.snippet.channelTitle,
              },
              detailsById[vid],
              vid
            );
          }),
        nextPageToken: plData.nextPageToken || null,
      };
    },
    60 * 60 * 1000 // 채널 업로드는 자주 안 바뀌니 1시간 유지
  );
  return res;
}

// 첫 장만 필요할 때 쓰는 간단한 형태 (추천 목록·구독 피드용)
async function fetchChannelVideoList(channelId) {
  const r = await fetchChannelVideos(channelId);
  return r.items;
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

// ── 시청 진행률 ────────────────────────────────────────────
// 어디까지 봤는지 기억해서 썸네일에 주황색 막대로 표시하고,
// 다 본 영상은 홈에서 빼줍니다. 브라우저에만 저장돼요.
const PROGRESS_KEY = "loop:progress";
const PROGRESS_LIMIT = 500;
// 이 비율을 넘겨 봤으면 "다 본 영상"으로 칩니다.
const WATCHED_RATIO = 0.85;

let progressCache = null;

function getProgressMap() {
  if (!progressCache) progressCache = loadStore(PROGRESS_KEY, {});
  return progressCache;
}

function getProgress(videoId) {
  const p = getProgressMap()[videoId];
  if (!p || !p.d) return 0;
  return Math.min(1, p.s / p.d);
}

function isWatched(videoId) {
  return getProgress(videoId) >= WATCHED_RATIO;
}

// 이어볼 지점(초). 다 본 영상이거나 끝자락이면 처음부터 재생합니다.
function getResumeTime(videoId) {
  const p = getProgressMap()[videoId];
  if (!p || !p.d) return 0;
  if (p.s / p.d >= WATCHED_RATIO) return 0;
  // 남은 시간이 10초도 안 되면 이어보기가 의미 없습니다.
  if (p.d - p.s < 10) return 0;
  // 처음 5초 안쪽은 그냥 처음부터 봅니다.
  if (p.s < 5) return 0;
  // 맥락을 잡을 수 있게 2초쯤 앞에서 시작합니다.
  return Math.max(0, Math.floor(p.s) - 2);
}

function saveProgress(videoId, seconds, duration) {
  if (!videoId || !duration || duration < 1) return;
  const map = getProgressMap();
  map[videoId] = { s: Math.floor(seconds), d: Math.floor(duration), at: Date.now() };

  // 오래된 기록부터 정리해서 무한정 커지지 않게 합니다.
  const keys = Object.keys(map);
  if (keys.length > PROGRESS_LIMIT) {
    keys
      .sort((a, b) => (map[a].at || 0) - (map[b].at || 0))
      .slice(0, keys.length - PROGRESS_LIMIT)
      .forEach((k) => delete map[k]);
  }

  progressCache = map;
  saveStore(PROGRESS_KEY, map);
}

function clearProgress() {
  progressCache = {};
  saveStore(PROGRESS_KEY, {});
}

// 다 본 영상을 빼되, 너무 많이 빠지면 화면이 휑해지니 최소 개수는 남깁니다.
function withoutWatched(list, floor = 8) {
  const fresh = list.filter((v) => !isWatched(v.videoId));
  if (fresh.length >= floor) return fresh;
  return [...fresh, ...list.filter((v) => isWatched(v.videoId)).slice(0, floor - fresh.length)];
}

// ── 시청 기록 ──────────────────────────────────────────────
// 최근 본 영상을 최신순으로 보관합니다. 브라우저에만 저장돼요.
const HISTORY_KEY = "loop:history";
const HISTORY_LIMIT = 200;

function loadHistory() {
  return loadStore(HISTORY_KEY, []);
}

function addHistory(video) {
  if (!video?.videoId) return;
  const prev = loadHistory().filter((v) => v.videoId !== video.videoId);
  // 목록에 필요한 정보만 추립니다.
  const entry = {
    videoId: video.videoId,
    title: video.title,
    channelTitle: video.channelTitle,
    channelId: video.channelId,
    thumbnail: video.thumbnail,
    dur: video.dur,
    seconds: video.seconds,
    views: video.views,
    publishedAt: video.publishedAt,
    // "4일 전" 같은 문자열은 저장하지 않습니다. 저장하면 시간이 지나도
    // 그대로 남아서 한 달 뒤에도 "4일 전"이라고 뜹니다.
    at: Date.now(),
  };
  saveStore(HISTORY_KEY, [entry, ...prev].slice(0, HISTORY_LIMIT));
}

function clearHistory() {
  saveStore(HISTORY_KEY, []);
}

// 저장된 기록을 화면에 쓸 형태로 되살립니다. 업로드 시점은 지금 기준으로 다시 계산해요.
function historyForDisplay() {
  return loadHistory().map((v) => ({
    ...v,
    // 기록 탭에서 궁금한 건 "영상이 언제 올라왔나"가 아니라 "내가 언제 봤나"입니다.
    // 볼 때 찍어둔 시각(at)이 있으면 그걸 보여주고, 없는 옛 기록만 업로드 날짜로 대신합니다.
    time: v.at
      ? `${formatRelativeTime(v.at).replace(" 전", "")} 전에 봄`
      : v.publishedAt
      ? formatRelativeTime(v.publishedAt)
      : "",
  }));
}

// ── 관심 없음 ──────────────────────────────────────────────
// 이 채널·영상은 홈에서 빼달라는 표시입니다.
const MUTED_KEY = "loop:muted";

function loadMuted() {
  const m = loadStore(MUTED_KEY, { channels: [], videos: [] });
  return { channels: m.channels || [], videos: m.videos || [] };
}

function muteChannel(channelId) {
  if (!channelId) return;
  const m = loadMuted();
  if (!m.channels.includes(channelId)) m.channels.push(channelId);
  saveStore(MUTED_KEY, m);
}

function muteVideo(videoId) {
  if (!videoId) return;
  const m = loadMuted();
  if (!m.videos.includes(videoId)) m.videos.push(videoId);
  // 너무 쌓이지 않게 최근 300개만 남깁니다.
  m.videos = m.videos.slice(-300);
  saveStore(MUTED_KEY, m);
}

function clearMuted() {
  saveStore(MUTED_KEY, { channels: [], videos: [] });
}

// ── 취향 요약 ──────────────────────────────────────────────
// 시청 기록에서 "어떤 채널을, 어떤 길이로, 얼마나 끝까지 보는지"를 뽑아냅니다.
// 점수를 매길 때마다 다시 계산하면 느리니 한 번 만들어 재사용합니다.
function buildTaste() {
  const history = loadHistory().slice(0, 80);
  const progress = getProgressMap();
  const scores = loadTopicScores();

  const channelHits = new Map();
  const channelFinish = new Map();
  let durSum = 0;
  let durCount = 0;

  history.forEach((v) => {
    if (v.channelId) {
      channelHits.set(v.channelId, (channelHits.get(v.channelId) || 0) + 1);
      const p = progress[v.videoId];
      if (p?.d) {
        const ratio = Math.min(1, p.s / p.d);
        const prev = channelFinish.get(v.channelId) || { sum: 0, n: 0 };
        channelFinish.set(v.channelId, { sum: prev.sum + ratio, n: prev.n + 1 });
      }
    }
    // 30초도 안 본 영상은 취향으로 치지 않습니다.
    const p = progress[v.videoId];
    if (v.seconds && p && p.s > 30) {
      durSum += v.seconds;
      durCount += 1;
    }
  });

  return {
    channelHits,
    channelFinish,
    // 즐겨 보는 영상 길이(초). 기록이 적으면 기준을 두지 않습니다.
    preferredSeconds: durCount >= 5 ? durSum / durCount : null,
    topicScores: scores,
    muted: loadMuted(),
  };
}

// 영상 하나에 점수를 매깁니다. 높을수록 앞에 옵니다.
function scoreVideo(v, taste, subscribedIds) {
  let score = 0;

  // 1) 채널 친밀도 — 최근에 자주 본 채널일수록 높게
  const hits = taste.channelHits.get(v.channelId) || 0;
  score += Math.min(6, hits * 1.5);

  // 2) 구독한 채널은 확실히 올려줍니다
  if (subscribedIds.includes(v.channelId)) score += 4;

  // 3) 완주율 — 그 채널 영상을 끝까지 보는 편이면 가산
  const fin = taste.channelFinish.get(v.channelId);
  if (fin && fin.n > 0) score += (fin.sum / fin.n) * 3;

  // 4) 카테고리 취향 (숏츠에서 쌓은 점수를 함께 씁니다)
  const catLabel = CATEGORIES.find((c) => c.id === v.categoryId)?.label;
  if (catLabel && taste.topicScores[catLabel]) {
    score += Math.max(-3, Math.min(3, taste.topicScores[catLabel]));
  }

  // 5) 길이 취향 — 즐겨 보는 길이와 가까울수록 가산
  if (taste.preferredSeconds && v.seconds) {
    const ratio = v.seconds / taste.preferredSeconds;
    // 0.5~2배 사이면 가산, 많이 벗어나면 0에 가까워집니다.
    score += ratio > 0.4 && ratio < 2.5 ? 2 : 0;
  }

  // 6) 신선도 — 최근에 올라온 영상 우대
  if (v.publishedAt) {
    const days = (Date.now() - new Date(v.publishedAt).getTime()) / 86400000;
    if (days < 1) score += 3;
    else if (days < 3) score += 2;
    else if (days < 7) score += 1;
    else if (days > 365) score -= 1;
  }

  // 7) 이미 본 영상은 감점 (많이 봤을수록 크게)
  const watched = getProgress(v.videoId);
  if (watched > 0.85) score -= 8;
  else if (watched > 0.1) score -= 2;

  // 8) 열자마자 껐던 영상은 취향이 아니었다는 뜻
  const p = getProgressMap()[v.videoId];
  if (p && p.s < 15 && p.d > 120) score -= 3;

  // 살짝 흔들어 매번 같은 순서가 되지 않게 합니다.
  score += Math.random() * 1.5;
  return score;
}

// 점수순으로 정렬하되, 한 채널이 화면을 독차지하지 않게 제한합니다.
function rankVideos(list, taste, subscribedIds, maxPerChannel = 2) {
  const scored = list
    .filter((v) => {
      if (taste.muted.channels.includes(v.channelId)) return false;
      if (taste.muted.videos.includes(v.videoId)) return false;
      return true;
    })
    // 점수에 작은 흔들림을 더합니다.
    // 점수만으로 세우면 후보가 같은 동안 홈이 늘 똑같은 순서로 나옵니다.
    // 흔들림 폭(3점)이 취향 신호(구독 +4, 자주 본 채널 +6)보다 작아서
    // 좋아하는 것이 밀려나지는 않고, 비슷한 점수끼리만 자리를 바꿉니다.
    .map((v) => ({ v, score: scoreVideo(v, taste, subscribedIds) + Math.random() * 3 }))
    .sort((a, b) => b.score - a.score);

  const perChannel = new Map();
  const picked = [];
  const held = [];

  scored.forEach(({ v }) => {
    const n = perChannel.get(v.channelId) || 0;
    if (n >= maxPerChannel) {
      held.push(v);
      return;
    }
    perChannel.set(v.channelId, n + 1);
    picked.push(v);
  });

  // 제한에 걸려 빠진 것들은 맨 뒤에 붙입니다.
  return [...picked, ...held];
}

// 최근 본 영상에서 자주 등장한 채널을 뽑습니다. 홈 추천에 씁니다.
function favoriteChannels(limit = 3) {
  const counts = new Map();
  // 최근 60개만 봅니다. 오래된 취향까지 반영하면 잘 안 바뀌어요.
  loadHistory()
    .slice(0, 60)
    .forEach((v) => {
      if (!v.channelId) return;
      counts.set(v.channelId, (counts.get(v.channelId) || 0) + 1);
    });
  return [...counts.entries()]
    // 두 번 이상 본 채널만 취향으로 봅니다.
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

// ── 재생목록 ───────────────────────────────────────────────
// 사용자가 직접 만드는 목록입니다.
const PLAYLIST_KEY = "loop:playlists";

function loadPlaylists() {
  return loadStore(PLAYLIST_KEY, []);
}

function savePlaylists(list) {
  saveStore(PLAYLIST_KEY, list);
}

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
    channelIds.map((id) => fetchChannelVideoList(id).catch(() => []))
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
      loading="lazy"
      decoding="async"
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

// 설명글 안의 주소를 눌러서 열 수 있게 바꿉니다.
const URL_RE = /(https?:\/\/[^\s]+)/g;

function LinkedText({ text }) {
  const parts = String(text || "").split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        URL_RE.test(part) && part.startsWith("http") ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#E8A33D", textDecoration: "none", overflowWrap: "anywhere" }}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
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

  // 기본 목록은 실패를 감추지 않습니다. 감추면 "결과 없음"처럼 보여서 원인을 알 수 없어요.
  // 곁들이는 카테고리 두 개만 실패해도 넘어갑니다.
  const [general, catA, catB] = await Promise.all([
    fetchPopular("KR"),
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

  // 최근 자주 본 채널의 새 영상도 섞습니다 (구독 안 한 채널까지 포함).
  const favorites = favoriteChannels(3).filter((id) => !subscribedIds.includes(id));
  if (favorites.length > 0) {
    const favVideos = await fetchSubscriptionFeed(favorites, 3).catch(() => []);
    buckets.push(dedupe(favVideos));
  }
  buckets.push(dedupe(general.items), dedupe(catA.items), dedupe(catB.items));

  // 후보를 한데 모은 뒤 영상 하나하나에 점수를 매겨 줄을 세웁니다.
  // 예전처럼 "출처 덩어리"를 번갈아 놓는 게 아니라, 취향에 맞는 순서로 정렬돼요.
  const candidates = buckets.flat();
  const taste = buildTaste();
  const ranked = rankVideos(tidyForHome(candidates, 0), taste, subscribedIds);

  return {
    items: ranked,
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
          loading="lazy"
          decoding="async"
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
            // 예전에는 여기에 backdrop-filter: blur(2px)가 있었습니다.
            // 카드마다 하나씩이라 목록에 24개가 깔리는데, 흐림 효과는 화면 뒤쪽을
            // 매번 다시 계산해야 해서 태블릿·휴대폰 GPU에 특히 무겁습니다.
            // 지름 38px 원에 2px 흐림은 눈에 거의 안 보였기 때문에,
            // 배경을 조금 더 진하게 하는 것으로 대신합니다.
            background: "rgba(15,13,10,0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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

      {/* 시청 진행률. 이어보기 지점을 한눈에 알 수 있게 아래쪽에 막대로 표시합니다. */}
      {getProgress(v.videoId) > 0.01 && (
        <div
          style={{
            position: "absolute",
            left: 6,
            right: 6,
            bottom: 6,
            height: 3,
            borderRadius: 2,
            background: "rgba(0,0,0,0.55)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, getProgress(v.videoId) * 100)}%`,
              height: "100%",
              background: "#E8A33D",
            }}
          />
        </div>
      )}
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

// 영상 카드는 목록마다 수십 개라, 데이터가 그대로면 다시 그리지 않습니다.
// (클릭 함수는 매번 새로 만들어지므로 비교에서 제외합니다.)
const VideoCard = React.memo(
  function VideoCard({ v, onClick, avatars, onOpenChannel, onMute }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: "pointer",
        transform: hover ? "translateY(-4px)" : "translateY(0)",
        transition: `transform ${MOTION.base}`,
        // 브라우저에 미리 알려주면 움직임이 더 매끄럽습니다.
        willChange: "transform",
        position: "relative",
      }}
    >
      <Thumb v={v} />

      {/* 관심 없음. 이 영상·채널을 홈에서 빼달라고 알려주는 버튼입니다. */}
      {onMute && (
        <div style={{ position: "absolute", top: 6, right: 6, zIndex: 3 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            title="관심 없음"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "rgba(10,9,8,0.75)",
              border: "none",
              color: "#F2EDE4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              opacity: hover || menuOpen ? 1 : 0.35,
              transition: `opacity ${MOTION.fast}`,
            }}
          >
            <X size={14} />
          </button>

          {menuOpen && (
            <>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
                style={{ position: "fixed", inset: 0, zIndex: 40 }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: 32,
                  right: 0,
                  zIndex: 41,
                  background: "#141210",
                  border: "1px solid #2C271F",
                  borderRadius: 10,
                  padding: 6,
                  minWidth: 150,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMute("video", v);
                    setMenuOpen(false);
                  }}
                  style={menuItemStyle(false)}
                >
                  이 영상 숨기기
                </button>
                {v.channelId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMute("channel", v);
                      setMenuOpen(false);
                    }}
                    style={menuItemStyle(false)}
                  >
                    이 채널 추천 안 함
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
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
            className="card-title"
            style={{
              color: "#F2EDE4",
              fontFamily: "'Fraunces', serif",
              fontSize: 14.5,
              lineHeight: 1.35,
              fontWeight: 600,
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
            className="card-sub"
            style={{
              color: "#8C8578",
              fontSize: 12.5,
              marginTop: 4,
              fontFamily: "'Inter', sans-serif",
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: v.channelId && onOpenChannel ? "pointer" : "inherit",
            }}
          >
            {v.channelTitle}
          </div>
          <div
            className="card-meta"
            style={{
              color: "#8C8578",
              fontSize: 12,
              marginTop: 2,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {v.views ? `조회수 ${v.views}회 · ${v.time}` : v.time}
          </div>
        </div>
      </div>
    </div>
  );
  },
  (a, b) => a.v === b.v && a.avatars === b.avatars
);

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
                    <span style={{ color: "#5C574C", fontSize: 10.5, fontFamily: "'Inter', sans-serif" }}>{r.time}</span>
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

const CommentList = React.memo(
  function CommentList({ videoId, compact, onSeek }) {
  const [items, setItems] = useState([]);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);

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

  // 댓글은 스크롤로 자동 로딩하지 않습니다.
  // 영상을 보다가 아래로 내렸을 뿐인데 계속 불러오면 방해가 되니까요.

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
              <span style={{ color: "#5C574C", fontSize: 11.5, fontFamily: "'Inter', sans-serif" }}>{c.time}</span>
            </div>
            <div
              className="selectable"
              style={{ color: "#D6D0C4", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
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

      {token && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            width: "100%",
            marginTop: 6,
            background: "#231F19",
            border: "none",
            borderRadius: 10,
            color: "#B8B2A4",
            padding: "12px 0",
            fontSize: 12.5,
            cursor: loadingMore ? "default" : "pointer",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {loadingMore ? (
            <>
              <Loader2 size={14} className="spin" /> 불러오는 중…
            </>
          ) : (
            <>
              <ChevronDown size={15} /> 댓글 더 보기
            </>
          )}
        </button>
      )}

      {!token && items.length > 0 && (
        <div style={{ textAlign: "center", color: "#3A342C", padding: "12px 0", fontSize: 11.5, fontFamily: "'Inter', sans-serif" }}>
          댓글 끝
        </div>
      )}
    </div>
  );
  },
  (a, b) => a.videoId === b.videoId && a.compact === b.compact
);

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

    let timers = [];
    if (cur) {
      // 새로 넘어간 영상의 플레이어는 아직 준비 중일 수 있습니다.
      // 한 번만 보내면 명령이 씹혀서 소리가 계속 꺼진 채로 남아요.
      const send = () => {
        post(cur.videoId, muted ? "mute" : "unMute");
        post(cur.videoId, "playVideo");
      };
      send();
      timers = [150, 400, 800, 1400].map((ms) => setTimeout(send, ms));
    }

    enteredAtRef.current = Date.now();
    lastIndexRef.current = index;
    setPlaying(true);
    setShowComments(false);

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items, muted]);

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
    const next = !muted;
    setMuted(next);
    if (!cur) return;
    // 여기서도 몇 번 나눠 보내 확실히 반영되게 합니다.
    const send = () => post(cur.videoId, next ? "mute" : "unMute");
    send();
    [120, 350].forEach((ms) => setTimeout(send, ms));
  };

  if (items.length === 0) return null;

  return (
    <div className="shorts-stage" style={{ position: "relative", height: "calc(100vh - 57px)", background: "#0A0908" }}>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="shorts-scroller"
        style={{
          height: "100%",
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          // 부드럽게 미끄러지도록
          scrollBehavior: "smooth",
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
                    loading="lazy"
                    decoding="async"
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
                  <div style={{ color: "#B8B2A4", fontSize: 12, marginTop: 6, fontFamily: "'Inter', sans-serif" }}>
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
        {loadingMore && <span style={{ fontFamily: "'Inter', sans-serif" }}> · 불러오는 중</span>}
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
  const [pageToken, setPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // 최신순(업로드 순서) / 인기순(조회수 순)
  const [sort, setSort] = useState("latest");
  const sentinelRef = useRef(null);

  // 정렬에 맞는 불러오기 함수를 골라 씁니다.
  const fetchPage = (token) =>
    sort === "popular" ? fetchChannelVideosPopular(channelId, token) : fetchChannelVideos(channelId, token);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpanded(false);
    setBannerIdx(0);
    setBannerFailed(false);
    window.scrollTo({ top: 0 });

    setPageToken(null);
    Promise.all([
      fetchChannelInfo(channelId),
      fetchPage("").catch(() => ({ items: [], nextPageToken: null })),
    ])
      .then(([channelInfo, page]) => {
        if (cancelled) return;
        if (!channelInfo) {
          setError("채널 정보를 찾지 못했어요.");
          return;
        }
        setInfo(channelInfo);
        setVideos(page.items);
        setPageToken(page.nextPageToken);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, sort]);

  // 목록 끝이 보이면 다음 장을 이어붙입니다.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !pageToken || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setLoadingMore(true);
        fetchPage(pageToken)
          .then((page) => {
            setVideos((prev) => {
              const seen = new Set(prev.map((v) => v.videoId));
              const added = page.items.filter((v) => !seen.has(v.videoId));
              // 더 붙일 게 없으면 그대로 두고 멈춥니다.
              if (added.length === 0) {
                setPageToken(null);
                return prev;
              }
              return [...prev, ...added];
            });
            setPageToken(page.nextPageToken);
          })
          .catch(() => setPageToken(null))
          .finally(() => setLoadingMore(false));
      },
      { rootMargin: "300px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [channelId, pageToken, loadingMore]);

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
    <div className="page-pad" style={{ padding: "20px 28px 60px", maxWidth: 1400, margin: "0 auto" }}>
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
              fontFamily: "'Inter', sans-serif",
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
        <span style={{ display: "inline-flex", gap: 6, marginLeft: 14, verticalAlign: "middle" }}>
          {[
            { key: "latest", label: "최신순" },
            { key: "popular", label: "인기순" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                if (sort === key) return;
                setSort(key);
              }}
              style={{
                border: "1px solid " + (sort === key ? "#E8A33D" : "#2C271F"),
                background: sort === key ? "#E8A33D" : "transparent",
                color: sort === key ? "#17140F" : "#B8B2A4",
                borderRadius: 16,
                padding: "5px 13px",
                fontSize: 12.5,
                fontWeight: 500,
                fontFamily: "'Inter', sans-serif",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      {videos.length === 0 ? (
        <div style={{ color: "#5C574C", padding: "40px 0", fontSize: 13 }}>영상을 불러오지 못했어요.</div>
      ) : (
        <div className="video-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "28px 20px" }}>
          {videos.map((v) => (
            <VideoCard
              key={v.videoId}
              v={v}
              avatars={avatars}
              onClick={() => onSelect(v, videos)}
              onOpenChannel={onOpenChannel}
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />

      {loadingMore && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#8C8578", padding: "24px 0", fontSize: 12.5 }}>
          <Loader2 size={15} className="spin" /> 더 불러오는 중…
        </div>
      )}

      {!loadingMore && !pageToken && videos.length > 0 && (
        <div style={{ textAlign: "center", color: "#3A342C", padding: "24px 0", fontSize: 11.5, fontFamily: "'Inter', sans-serif" }}>
          마지막 영상이에요
        </div>
      )}
    </div>
  );
}

// 직접 만든 플레이어 컨트롤. 유튜브 기본 컨트롤을 끄고(controls=0) 이걸 씁니다.
function PlayerControls({
  p,
  visible,
  fullscreen,
  captionsOn,
  speedOpen,
  setSpeedOpen,
  scrubbing,
  setScrubbing,
  onPlayPause,
  onSeek,
  onVolume,
  onMute,
  onRate,
  onCaptions,
  onShare,
  onFullscreen,
  shared,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  captionSize,
  onCaptionSize,
  quality,
  onQuality,
}) {
  const barRef = useRef(null);
  const [ccOpen, setCcOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const shown = scrubbing != null ? scrubbing : p.current;
  // 진행 바 폭은 CSS 전환으로 부드럽게 이어줍니다.
  // 그래야 1초에 한 번만 갱신해도 뚝뚝 끊겨 보이지 않아요.
  const ratio = p.duration > 0 ? Math.min(1, shown / p.duration) : 0;

  const posFromEvent = (e) => {
    const el = barRef.current;
    if (!el || !p.duration) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * p.duration;
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: fullscreen ? "40px 20px 18px" : "34px 14px 12px",
        background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
        zIndex: 5,
        opacity: visible ? 1 : 0,
        transition: `opacity ${MOTION.base}`,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* 진행 바 */}
      <div
        ref={barRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setScrubbing(posFromEvent(e));
        }}
        onPointerMove={(e) => {
          if (scrubbing != null) setScrubbing(posFromEvent(e));
        }}
        onPointerUp={(e) => {
          if (scrubbing != null) {
            onSeek(posFromEvent(e));
            setScrubbing(null);
          }
        }}
        onPointerCancel={() => setScrubbing(null)}
        style={{ padding: "10px 0", cursor: "pointer", touchAction: "none" }}
      >
        <div style={{ position: "relative", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.28)" }}>
          <div
            style={{
              width: `${ratio * 100}%`,
              height: "100%",
              borderRadius: 2,
              background: "#E8A33D",
              transition: scrubbing != null ? "none" : "width 1s linear",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${ratio * 100}%`,
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: scrubbing != null ? 16 : 12,
              height: scrubbing != null ? 16 : 12,
              borderRadius: "50%",
              background: "#E8A33D",
              transition:
                scrubbing != null
                  ? `width ${MOTION.fast}, height ${MOTION.fast}`
                  : `left 1s linear, width ${MOTION.fast}, height ${MOTION.fast}`,
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <CtrlButton onClick={onPrev} title="이전 영상" disabled={!hasPrev}>
          <SkipBack size={17} fill={hasPrev ? "#F2EDE4" : "none"} />
        </CtrlButton>

        <CtrlButton onClick={onPlayPause} title={p.playing ? "일시정지" : "재생"} big>
          {p.playing ? <Pause size={22} fill="#F2EDE4" /> : <Play size={22} fill="#F2EDE4" />}
        </CtrlButton>

        <CtrlButton onClick={onNext} title="다음 영상" disabled={!hasNext}>
          <SkipForward size={17} fill={hasNext ? "#F2EDE4" : "none"} />
        </CtrlButton>

        <span
          style={{
            color: "#F2EDE4",
            fontSize: 12,
            fontFamily: "'IBM Plex Mono', monospace",
            marginLeft: 2,
            marginRight: 6,
            whiteSpace: "nowrap",
          }}
        >
          {clockTime(shown)} / {clockTime(p.duration)}
        </span>

        <CtrlButton onClick={onMute} title={p.muted ? "음소거 해제" : "음소거"}>
          {p.muted || p.volume === 0 ? <VolumeX size={18} /> : p.volume < 50 ? <Volume1 size={18} /> : <Volume2 size={18} />}
        </CtrlButton>
        <input
          type="range"
          min="0"
          max="100"
          value={p.muted ? 0 : p.volume}
          onChange={(e) => onVolume(Number(e.target.value))}
          title="음량"
          style={{ width: 74, accentColor: "#E8A33D", cursor: "pointer" }}
        />

        <div style={{ flex: 1, minWidth: 4 }} />

        <div style={{ position: "relative" }}>
          <CtrlButton onClick={() => setCcOpen((o) => !o)} title="자막" active={captionsOn}>
            <Subtitles size={18} />
          </CtrlButton>
          {ccOpen && (
            <div style={menuBoxStyle}>
              <button onClick={onCaptions} style={menuItemStyle(false)}>
                {captionsOn ? "자막 끄기" : "자막 켜기"}
              </button>
              <div style={{ borderTop: "1px solid #231F19", margin: "5px 0" }} />
              <div style={{ color: "#5C574C", fontSize: 10.5, padding: "2px 10px 5px" }}>자막 크기</div>
              {[
                [-1, "작게"],
                [0, "보통"],
                [1, "크게"],
                [2, "더 크게"],
                [3, "아주 크게"],
              ].map(([val, label]) => (
                <button key={val} onClick={() => onCaptionSize(val)} style={menuItemStyle(captionSize === val)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: "relative" }}>
          <CtrlButton onClick={() => setQualityOpen((o) => !o)} title="화질" active={quality !== "auto"}>
            <Settings size={18} />
          </CtrlButton>
          {qualityOpen && (
            <div style={menuBoxStyle}>
              <div style={{ color: "#5C574C", fontSize: 10.5, padding: "2px 10px 5px", lineHeight: 1.4 }}>
                화질 요청
                <br />
                (유튜브가 무시할 수 있어요)
              </div>
              {[
                ["auto", "자동"],
                ["hd1080", "1080p"],
                ["hd720", "720p"],
                ["large", "480p"],
                ["medium", "360p"],
                ["small", "240p"],
              ].map(([val, label]) => (
                <button key={val} onClick={() => onQuality(val)} style={menuItemStyle(quality === val)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: "relative" }}>
          <CtrlButton onClick={() => setSpeedOpen((o) => !o)} title="재생 속도" active={p.rate !== 1}>
            <Gauge size={18} />
          </CtrlButton>
          {speedOpen && (
            <div style={menuBoxStyle}>
              {p.rates.map((r) => (
                <button key={r} onClick={() => onRate(r)} style={menuItemStyle(r === p.rate)}>
                  {r === 1 ? "보통" : `${r}x`}
                </button>
              ))}
            </div>
          )}
        </div>

        <CtrlButton onClick={onShare} title="링크 복사" active={shared}>
          <Share2 size={17} />
        </CtrlButton>

        <CtrlButton onClick={onFullscreen} title={fullscreen ? "전체화면 나가기" : "전체화면"}>
          {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </CtrlButton>
      </div>
    </div>
  );
}

// 초를 0:00 / 1:02:03 형태로 바꿉니다.
function clockTime(sec) {
  const t = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function CtrlButton({ onClick, title, active, big, disabled, children }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      style={{
        background: "none",
        border: "none",
        color: disabled ? "#5C574C" : active ? "#E8A33D" : "#F2EDE4",
        width: big ? 44 : 36,
        height: big ? 44 : 36,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
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

// 영상 목록. 재생 시간 같은 다른 상태가 바뀌어도 목록은 그대로 두려고 따로 뺐습니다.
const VideoGrid = React.memo(
  function VideoGrid({ items, avatars, onSelect, onOpenChannel, onMute }) {
    return (
      <div
        className="video-grid fade-in"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "28px 20px" }}
      >
        {items.map((v) => (
          <VideoCard
            key={v.videoId}
            v={v}
            avatars={avatars}
            onClick={() => onSelect(v)}
            onOpenChannel={onOpenChannel}
            onMute={onMute}
          />
        ))}
      </div>
    );
  },
  (a, b) => a.items === b.items && a.avatars === b.avatars && a.onMute === b.onMute
);

// 화면 폭이 기준보다 좁은지 알려줍니다.
// CSS로 양쪽을 다 그려놓고 감추면 DOM이 두 배가 되니, 한쪽만 그리려고 씁니다.
function useNarrow(maxWidth = 900) {
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth <= maxWidth : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [maxWidth]);
  return narrow;
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
  dragHandlers,
  onAddToPlaylist,
  onShare,
  shared,
}) {

  const [descOpen, setDescOpen] = useState(false);
  // 좁은 화면이면 "다음 영상"을 댓글 위에, 넓으면 오른쪽에 그립니다.
  const narrow = useNarrow(900);

  // 다른 영상으로 넘어가면 맨 위로. 부드럽게(smooth) 굴리면 접기·펼치기
  // 애니메이션과 움직임이 겹쳐서 오히려 버벅여 보여서 즉시 이동합니다.
  useEffect(() => {
    setDescOpen(false);
    window.scrollTo(0, 0);
  }, [v.videoId]);

  // 바로 복사하지 않고 확인 창을 거칩니다.
  const handleShare = () => onShare(v);

  return (
    <div className="page-pad" style={{ padding: "20px 28px 60px", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0 16px" }}>
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
            padding: 0,
          }}
        >
          <ChevronLeft size={16} /> 목록으로
        </button>

        {/* 쓸어내리기가 잘 안 잡힐 때를 대비한 접기 버튼 */}
        <button
          onClick={onMinimize}
          title="작은 창으로 접기"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#231F19",
            border: "none",
            borderRadius: 18,
            color: "#B8B2A4",
            fontFamily: "'Inter', sans-serif",
            fontSize: 12.5,
            cursor: "pointer",
            padding: "7px 14px",
          }}
        >
          <ChevronDown size={15} /> 접기
        </button>
      </div>

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

          {/* 제목 영역에서도 아래로 쓸어내려 접을 수 있습니다. */}
          <h1
            {...(dragHandlers || {})}
            style={{
              fontFamily: "'Fraunces', serif",
              fontWeight: 600,
              fontSize: 22,
              color: "#F2EDE4",
              marginTop: 18,
              lineHeight: 1.3,
              touchAction: "none",
              cursor: "grab",
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
                <div style={{ color: "#8C8578", fontSize: 12 }}>
                  조회수 {v.views || "-"}회{v.time ? ` · ${v.time}` : ""}
                </div>
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
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {subscribed ? "구독중" : "구독"}
              </button>
            </div>

            <div className="action-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  whiteSpace: "nowrap",
                  flexShrink: 0,
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
                  background: shared ? "#4A7A6B" : "#231F19",
                  color: "#F2EDE4",
                  border: "none",
                  borderRadius: 20,
                  padding: "9px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                  transition: `background ${MOTION.fast}`,
                }}
              >
                <Share2 size={15} /> {shared ? "복사됨!" : "공유"}
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
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <Bookmark size={15} fill={saved ? "#17140F" : "none"} /> {saved ? "저장됨" : "저장"}
              </button>
              <button
                onClick={() => onAddToPlaylist(v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#231F19",
                  color: "#F2EDE4",
                  border: "none",
                  borderRadius: 20,
                  padding: "9px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <ListPlus size={15} /> 재생목록
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
                maxHeight: descOpen ? "none" : 140,
                overflow: descOpen ? "visible" : "hidden",
              }}
              className="selectable"
            >
              <LinkedText text={descOpen ? v.description : v.description.slice(0, 400)} />
              {!descOpen && v.description.length > 400 && "…"}
              {v.description.length > 400 && (
                <button
                  onClick={() => setDescOpen((o) => !o)}
                  style={{
                    display: "block",
                    marginTop: 8,
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "#E8A33D",
                    fontSize: 12.5,
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {descOpen ? "접기" : "더 보기"}
                </button>
              )}
            </div>
          )}

          {/* 좁은 화면에서는 "다음 영상"이 댓글 아래로 밀려 찾기 어려워집니다.
              그래서 댓글 위에 같은 목록을 한 번 더 보여줍니다. */}
          {narrow && (
          <div className="related-inline">
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
                      fontWeight: 600,
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
                  <div style={{ color: "#8C8578", fontSize: 11, fontFamily: "'Inter', sans-serif" }}>{r.views}회</div>
                </div>
              </div>
            ))}
          </div>
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

        {!narrow && (
        <div className="related-side" style={{ flex: "0 0 340px", minWidth: 280 }}>
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
                      fontWeight: 600,
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
                  <div style={{ color: "#8C8578", fontSize: 11, fontFamily: "'Inter', sans-serif" }}>{r.views}회</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { icon: Home, label: "홈" },
  { icon: Zap, label: "숏츠" },
  { icon: Users, label: "구독" },
  { icon: Clock, label: "기록" },
  { icon: Bookmark, label: "보관함" },
];

export default function App() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const [videos, setVideos] = useState([]);
  // 첫 목록을 받아오기 전이므로 로딩 상태로 시작합니다.
  // false로 두면 잠깐 "검색 결과가 없어요"가 스쳐 지나갑니다.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [related, setRelated] = useState([]);
  const [avatars, setAvatars] = useState({});
  const [nextPageToken, setNextPageToken] = useState(null);
  const [shorts, setShorts] = useState([]);
  const [shortsIndex, setShortsIndex] = useState(0);
  const [shortsLoading, setShortsLoading] = useState(false);
  // 더 가져올 숏츠가 없을 때 계속 요청하지 않도록 표시해둡니다.
  const [shortsExhausted, setShortsExhausted] = useState(false);
  const [subFeed, setSubFeed] = useState([]);
  const [subChannels, setSubChannels] = useState([]);
  const [history, setHistory] = useState(() => historyForDisplay());
  const [playlists, setPlaylists] = useState(() => loadPlaylists());
  // 어떤 영상을 어느 재생목록에 넣을지 고르는 창
  const [playlistTarget, setPlaylistTarget] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  // 새로고침 때 채널 페이지를 다시 불러오게 하는 값입니다.
  const [refreshKey, setRefreshKey] = useState(0);
  // 검색 결과 정렬: relevance(관련순) | viewCount(인기순) | date(최신순)
  const [searchOrder, setSearchOrder] = useState("relevance");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [openChannel, setOpenChannel] = useState(null);
  // 미니 플레이어. 영상을 보다 나가도 재생을 이어가려고 iframe을 App에 두고 위치만 옮깁니다.
  const [minimized, setMinimized] = useState(false);
  const [slotRect, setSlotRect] = useState(null);
  const playerFrameRef = useRef(null);
  // 아래로 쓸어내려 접기. 손가락을 뗄 때까지의 이동량을 담아둡니다.
  // 끌기 중에는 상태를 바꾸지 않습니다. 상태를 바꾸면 앱 전체가 다시 그려져 버벅여요.
  // 대신 플레이어 요소의 스타일을 직접 만져서 손가락을 따라가게 합니다.
  const dragYRef = useRef(0);
  const playerBoxRef = useRef(null);
  const dragRafRef = useRef(null);
  // 화면 상태가 바뀌기 직전의 플레이어 위치·크기입니다. 전환 애니메이션의 출발점이에요.
  const flipFromRef = useRef(null);
  // 지금 돌아가고 있는 전환 애니메이션. 새 애니메이션을 걸기 전에 취소합니다.
  const flipAnimRef = useRef(null);
  // 끌기 위해 붙잡아 둔 포인터. 손을 뗐을 때 확실히 놓아주기 위해 기억해 둡니다.
  const dragPointerRef = useRef(null);
  // 전환하는 동안 영상이 찌그러지지 않게 반대로 걸어주는 애니메이션입니다.
  const frameAnimRef = useRef(null);
  // 목록에서 어디까지 내려봤는지. 영상을 접고 돌아올 때 그 자리로 되돌립니다.
  const listScrollRef = useRef(0);
  // 유튜브 기본 전체화면 대신 우리가 직접 만든 전체화면입니다.
  // 기본 전체화면은 iframe이 터치를 다 가져가서 쓸어내리기를 감지할 수 없어요.
  const [fullscreen, setFullscreen] = useState(false);
  // 건너뛰기 버튼이 기준으로 삼을 현재 재생 위치입니다.
  const playerTimeRef = useRef({ current: 0, duration: 0 });
  // 직접 만든 플레이어 컨트롤 상태입니다.
  // 유튜브 기본 컨트롤(controls=0)을 끄고 우리가 그리기 때문에 여기서 전부 관리해요.
  const [pState, setPState] = useState({
    playing: true,
    current: 0,
    duration: 0,
    volume: 100,
    muted: false,
    rate: 1,
    rates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
  });
  const [captionsOn, setCaptionsOn] = useState(false);
  // 자막 크기(-1 작게 ~ 3 아주 크게)와 화질 요청값입니다.
  const [captionSize, setCaptionSize] = useState(0);
  const [quality, setQuality] = useState("auto");
  // 전체화면일 때 화면을 돌려야 하는지 (좁고 세로로 든 기기)
  const [rotateFullscreen, setRotateFullscreen] = useState(false);
  // 안드로이드 시스템 PiP(앱 밖에 떠 있는 작은 창)로 들어가 있는지.
  // 이때는 영상만 꽉 채우고 나머지 화면 요소는 모두 감춥니다.
  const [pipMode, setPipMode] = useState(false);
  // 영상이 끝났는지. 유튜브 종료 화면 대신 우리 화면을 띄우려고 씁니다.
  const [ended, setEnded] = useState(false);
  // 첫 재생이 시작되기 전까지는 유튜브 로딩 화면(로고·동영상 더보기)이 보입니다.
  // 그동안 우리 화면으로 덮으려고 씁니다.
  const [started, setStarted] = useState(false);
  // 로딩 덮개는 잠깐만 보여줍니다. 자동 재생이 막힌 기기(아이폰)에서는
  // 덮개를 걷어야 유튜브 재생 버튼을 누를 수 있어요.
  // 재생이 곧 시작될 것 같으면 스피너, 자동 재생이 막힌 것 같으면 "눌러서 재생"을 띄웁니다.
  const [needsTap, setNeedsTap] = useState(false);
  // 렌더 밖(메시지 핸들러)에서 자막 상태를 참조하기 위한 사본입니다.
  const captionsOnRef = useRef(false);
  captionsOnRef.current = captionsOn;
  const [speedOpen, setSpeedOpen] = useState(false);
  // 진행 바를 끄는 동안에는 재생 위치가 손가락을 따라오게 합니다.
  const [scrubbing, setScrubbing] = useState(null);

  // 건너뛰기 버튼은 2초 뒤 사라집니다. 사라져도 같은 자리를 누르면 그대로 동작해요.
  const [controlsShown, setControlsShown] = useState(true);
  const controlsTimerRef = useRef(null);
  // 렌더 밖(메시지 핸들러)에서 현재 표시 여부를 보기 위한 사본입니다.
  const controlsShownRef = useRef(true);
  controlsShownRef.current = controlsShown;
  // 멈춤 여부도 렌더 밖에서 참조합니다.
  const pausedRef = useRef(false);
  // 손가락을 대는 순간 컨트롤이 켜져 있었는지. 탭으로 켤지 끌지 판단합니다.
  const controlsWereShownRef = useRef(false);
  // 같은 쪽을 연달아 눌렀는지 기억합니다. 유튜브처럼 두 번 눌러야 건너뛰어요.
  const lastTapRef = useRef({ zone: null, at: 0 });

  const hideControls = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    setControlsShown(false);
  }, []);

  const showControls = useCallback(() => {
    // 이미 보이는 중이면 상태를 건드리지 않습니다.
    // 포인터가 움직일 때마다 setState를 부르면 화면이 계속 다시 그려져요.
    setControlsShown((shown) => (shown ? shown : true));
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    // 멈춰 있을 때는 자동으로 숨기지 않습니다.
    if (pausedRef.current) return;
    controlsTimerRef.current = setTimeout(() => setControlsShown(false), 2000);
  }, []);

  // 전체화면에서는 가로로 보여줍니다.
  // 기기 방향을 바꿀 수 있으면 그렇게 하고, 안 되면 플레이어를 90도 돌립니다.
  useEffect(() => {
    if (!fullscreen) {
      setRotateFullscreen(false);
      // 방향 잠금을 풀어둡니다.
      try {
        window.screen?.orientation?.unlock?.();
      } catch (e) {
        // 지원하지 않는 기기는 그냥 넘어갑니다.
      }
      return;
    }

    const decide = () => {
      const narrow = window.innerWidth <= 600;
      const portrait = window.innerHeight > window.innerWidth;
      setRotateFullscreen(narrow && portrait);
    };

    // 기기 방향을 직접 바꿀 수 있으면 그게 가장 자연스럽습니다.
    let locked = false;
    try {
      const p = window.screen?.orientation?.lock?.("landscape");
      if (p && typeof p.then === "function") {
        p.then(() => {
          locked = true;
          setRotateFullscreen(false);
        }).catch(decide);
      } else {
        decide();
      }
    } catch (e) {
      decide();
    }

    const onResize = () => {
      if (!locked) decide();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [fullscreen]);

  // 전체화면에 들어가면 화면을 가로로 돌립니다. 나오면 잠금을 풉니다.
  // 아이폰 사파리는 이 기능을 지원하지 않아 조용히 넘어갑니다.
  useEffect(() => {
    const orientation = window.screen?.orientation;
    if (!orientation?.lock) return;

    if (fullscreen) {
      orientation.lock("landscape").catch(() => {
        // 지원하지 않는 기기에서는 그냥 둡니다.
      });
    } else {
      try {
        orientation.unlock();
      } catch (e) {
        // 무시
      }
    }

    return () => {
      try {
        orientation.unlock();
      } catch (e) {
        // 무시
      }
    };
  }, [fullscreen]);

  // 아이폰·아이패드는 소리가 있는 자동 재생을 막습니다. 그래서 재생이 저절로
  // 시작되지 않고 플레이어가 계속 대기 상태로 남아요. 예전에는 스피너만 돌다가
  // 덮개가 조용히 사라져서 "무한 로딩"처럼 보였습니다.
  // 3초 안에 시작되지 않으면 눌러 달라고 안내합니다.
  // 예전에는 1.5초였는데, 안드로이드처럼 자동 재생이 되는 기기에서도
  // 버퍼링이 조금만 길면 안내가 깜빡였다 사라져서 오히려 어수선했습니다.
  // 덮개는 터치를 통과시키므로(pointerEvents: none) 그 자리를 그대로 누르면 됩니다.
  // 유튜브 플레이어가 직접 탭을 받아야 iOS가 재생을 허용해줍니다.
  useEffect(() => {
    if (!selected || started) return;
    const t = setTimeout(() => setNeedsTap(true), 3000);
    return () => clearTimeout(t);
  }, [selected, started]);

  // 영상이 바뀌거나 재생 상태가 바뀌면 컨트롤을 다시 띄우고 타이머를 겁니다.
  // 멈춤 → 재생으로 바뀌었을 때 타이머가 다시 걸려야 자동으로 사라집니다.
  useEffect(() => {
    if (!selected) return;
    pausedRef.current = !pState.playing;
    showControls();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [selected, fullscreen, pState.playing, showControls]);

  // 영상을 열 때의 이어보기 지점. 재생 중 진행률이 갱신돼도 여기는 바뀌지 않습니다.
  // (바뀌면 iframe 주소가 달라져서 플레이어가 다시 로드돼 버려요.)
  const [resumeAt, setResumeAt] = useState(0);
  // 이전/다음 영상을 위해, 어느 목록에서 열었는지 기억해둡니다.
  const [queue, setQueue] = useState([]);
  const dragStartRef = useRef(null);
  // 손가락이 실제로 움직였는지. 탭(재생/일시정지)과 끌기를 구분합니다.
  const dragMovedRef = useRef(false);
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
  const runHome = useCallback(async (channelIds, isRetry = false) => {
    setLoading(true);
    setError(null);
    try {
      const { items, nextPageToken: token } = await fetchHome(channelIds);

      // 빈 목록이 오면 캐시를 비우고 딱 한 번만 다시 받아옵니다.
      if (items.length === 0 && !isRetry) {
        try {
          Object.keys(sessionStorage)
            .filter((k) => k.startsWith("loop:popular"))
            .forEach((k) => sessionStorage.removeItem(k));
        } catch (err) {
          // 접근이 막혀 있으면 그냥 다시 시도합니다.
        }
        const second = await fetchHome(channelIds);
        setVideos(second.items);
        setNextPageToken(second.nextPageToken);
        setSource({ kind: "home" });
        if (second.items.length === 0) {
          setError("지금은 보여줄 영상을 찾지 못했어요. 새로고침을 눌러보세요.");
        }
        return;
      }

      setVideos(items);
      setNextPageToken(token);
      setSource({ kind: "home" });
      if (items.length === 0) setError("지금은 보여줄 영상을 찾지 못했어요. 새로고침을 눌러보세요.");
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
      setSource({ kind: "category", categoryId });
      const { items, nextPageToken: token } = await fetchPopular("KR", "", categoryId);
      // 카테고리 목록도 같은 방식으로 줄을 세웁니다.
      setVideos(rankVideos(tidyForHome(items, 0), buildTaste(), subs));
      setNextPageToken(token);
      if (items.length === 0) setError("이 카테고리에는 지금 보여줄 영상이 없어요.");
    } catch (e) {
      setError(e.message || "영상을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [subs]);

  const runSearch = useCallback(async (q, order = "relevance") => {
    setLoading(true);
    setError(null);
    // 어떤 목록을 보고 있는지 먼저 표시해 둡니다.
    // 이게 늦으면, 첫 결과가 그려지는 순간 "더 불러오기"가 아직 홈인 줄 알고
    // 인기 영상을 검색 결과 밑에 붙여버립니다. 검색과 무관한 영상이 섞이던 원인이었어요.
    setSource({ kind: "search", query: q, order });
    try {
      // 1단계 결과가 오면 바로 그리고, 상세 정보는 도착하는 대로 덮어씁니다.
      const { items, nextPageToken: token } = await searchYoutube(
        q,
        "",
        (partial) => {
          setVideos(partial.items);
          setNextPageToken(partial.nextPageToken);
          setLoading(false);
        },
        order
      );
      setVideos(items);
      setNextPageToken(token);
    } catch (e) {
      setError(e.message || "검색 중 문제가 생겼어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 앱을 켜면 홈 목록을 한 번 불러옵니다.
  // 구독은 저장된 값을 바로 읽어 씁니다. subs 상태를 기다리면 첫 로딩이 늦어져요.
  useEffect(() => {
    runHome(loadStore("loop:subs", []));
  }, [runHome]);

  const runShorts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 첫 묶음이 오면 바로 재생을 시작하고, 두 번째 주제는 뒤이어 붙습니다.
      setShortsExhausted(false);
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
    if (activeNav !== "숏츠" || shortsLoading || shortsExhausted) return;
    if (shorts.length === 0 || shortsIndex < shorts.length - 3) return;
    setShortsLoading(true);
    fetchShorts(undefined, shorts.map((v) => v.videoId))
      .then((more) => {
        setShorts((prev) => {
          const seen = new Set(prev.map((v) => v.videoId));
          const added = more.filter((v) => !seen.has(v.videoId));
          // 새로 붙일 게 없으면 배열을 그대로 둡니다.
          // 새 배열을 만들면 이 효과가 다시 돌면서 요청이 무한 반복돼요.
          if (added.length === 0) {
            setShortsExhausted(true);
            return prev;
          }
          loadAvatars(added);
          return [...prev, ...added];
        });
      })
      .catch(() => setShortsExhausted(true))
      .finally(() => setShortsLoading(false));
  }, [activeNav, shortsIndex, shorts, shortsLoading, shortsExhausted, loadAvatars]);

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
  // 목록에서 영상을 고를 때 씁니다. 함수가 매번 새로 만들어지면
  // 목록 전체가 다시 그려지므로 한 번만 만들어 재사용합니다.
  const displayListRef = useRef([]);
  const openVideoRef = useRef(null);
  const selectFromList = useCallback((v) => openVideoRef.current?.(v, displayListRef.current), []);

  const openVideo = (v, list) => {
    // 최근 본 영상으로 남깁니다.
    addHistory(v);
    setHistory(historyForDisplay());

    // 목록을 같이 넘기면 그 안에서 이전/다음으로 넘어갈 수 있습니다.
    if (Array.isArray(list) && list.length > 0) setQueue(list);
    else if (!queue.some((x) => x.videoId === v.videoId)) setQueue([v]);

    // 목록에서 영상을 골랐다면, 돌아왔을 때 그 자리로 되돌아가도록 적어둡니다.
    if (!(selected && !minimized && !openChannel)) listScrollRef.current = window.scrollY;

    // 이어볼 지점을 먼저 정합니다. 다 본 영상이면 0(처음부터)이 됩니다.
    setResumeAt(getResumeTime(v.videoId));
    playerTimeRef.current = { current: 0, duration: 0 };
    setPState((p) => ({ ...p, playing: true, current: 0, duration: 0 }));
    setCaptionsOn(false);
    setSpeedOpen(false);
    setScrubbing(null);
    setEnded(false);
    setStarted(false);
    setNeedsTap(false);
    setSelected(v);
    setMinimized(false);
    setFullscreen(false);
    setOpenChannel(null);
  };

  const closePlayer = () => {
    setSelected(null);
    setMinimized(false);
    setFullscreen(false);
    dragYRef.current = 0;
  };

  // 펼친 플레이어를 아래로 끌면 미니 플레이어로 접힙니다.
  // 포인터 이벤트를 쓰면 터치·마우스가 한 번에 처리되고, 손가락이 영역을 벗어나도 따라옵니다.
  // 끌리는 동안 플레이어 요소의 스타일만 직접 바꿉니다 (다시 그리기 없음).
  const applyDragStyle = (y) => {
    const el = playerBoxRef.current;
    if (!el) return;
    if (minimized) {
      el.style.transform =
        y > 0
          ? `translateY(${y}px)`
          : `translateY(${y / 3}px) scale(${Math.min(1.08, 1 - y / 500)})`;
      el.style.opacity = y > 0 ? String(Math.max(0.3, 1 - y / 220)) : "1";
    } else if (fullscreen) {
      el.style.transform = y > 0 ? `translateY(${y}px)` : "";
      el.style.opacity = y > 0 ? String(Math.max(0.5, 1 - y / 400)) : "1";
    } else {
      // 아래로 끌면 작아지고, 위로 끌면 살짝 커집니다.
      el.style.transform =
        y > 0
          ? `translateY(${y}px) scale(${Math.max(0.82, 1 - y / 900)})`
          : `translateY(${y / 3}px) scale(${Math.min(1.05, 1 - y / 1400)})`;
      el.style.opacity = y > 0 ? String(Math.max(0.55, 1 - y / 500)) : "1";
    }
  };

  // 끌던 흔적을 애니메이션 없이 즉시 지웁니다.
  const clearDragStyle = () => {
    const el = playerBoxRef.current;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
    el.style.opacity = "";
  };

  // 문턱을 못 넘고 손을 뗐을 때, 원래 자리로 스르륵 돌아옵니다.
  // CSS transition 대신 Web Animations를 쓰면 화면 합성기가 처리해서
  // 자바스크립트가 바쁠 때도 애니메이션이 끊기지 않습니다.
  const springBackDragStyle = () => {
    const el = playerBoxRef.current;
    if (!el) return;
    const from = el.style.transform;
    const fromOpacity = el.style.opacity || "1";
    clearDragStyle();
    if (!from) return;
    flipAnimRef.current?.cancel();
    flipAnimRef.current = el.animate(
      [
        { transform: from, opacity: fromOpacity },
        { transform: "none", opacity: "1" },
      ],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  };

  // 지금 눈에 보이는 플레이어 위치를 기억해 둡니다. 전환 애니메이션의 출발점이에요.
  const captureFlipStart = () => {
    const el = playerBoxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) flipFromRef.current = r;
  };

  // 작은 창 ↔ 펼침 ↔ 전체화면을 오갈 때는 항상 이 함수를 씁니다.
  // 바뀌기 직전 위치를 기억해 두면 아래 useLayoutEffect가 그 자리에서
  // 새 자리까지 자연스럽게 이어 붙여줍니다.
  const changeView = (next) => {
    // 목록이 보이는 동안에만 스크롤 위치가 의미 있습니다.
    if (!(selected && !minimized && !openChannel)) listScrollRef.current = window.scrollY;
    captureFlipStart();
    clearDragStyle();
    if (typeof next.minimized === "boolean") setMinimized(next.minimized);
    if (typeof next.fullscreen === "boolean") setFullscreen(next.fullscreen);
  };

  // 목록을 보던 위치를 기억해 뒀다가, 영상을 접고 돌아올 때 그 자리로 되돌립니다.
  // (아래 FLIP 효과보다 먼저 실행돼야 전환 애니메이션이 엉뚱한 자리에서 시작하지 않습니다.)
  const expandedRef = useRef(false);
  useLayoutEffect(() => {
    const expanded = !!(selected && !minimized && !openChannel);
    if (expanded === expandedRef.current) return;
    expandedRef.current = expanded;
    // 목록을 숨기는 순간 브라우저가 스크롤을 0으로 당겨버리기 때문에,
    // 보던 위치는 화면을 바꾸기 전에(changeView·openVideo에서) 미리 적어둡니다.
    if (expanded) {
      window.scrollTo(0, 0);
    } else {
      // 목록이 다시 보이도록 바뀐 직후라 페이지 높이가 아직 반영이 안 돼 있습니다.
      // 높이를 한 번 읽어 브라우저가 배치를 새로 계산하게 한 뒤에 되돌려야
      // 스크롤이 맨 위로 잘려버리지 않습니다.
      void document.documentElement.scrollHeight;
      window.scrollTo(0, listScrollRef.current);
    }
  }, [selected, minimized, openChannel]);

  // FLIP 방식: 이전 자리와 새 자리의 차이를 transform으로 되돌린 뒤 0으로 풀어줍니다.
  // 위치·크기(top/left/width/height)를 직접 애니메이션하면 매 프레임 화면 배치를
  // 다시 계산해서 버벅이는데, transform·opacity만 쓰면 그럴 일이 없습니다.
  useLayoutEffect(() => {
    const el = playerBoxRef.current;
    const from = flipFromRef.current;
    flipFromRef.current = null;
    if (!el || !from) return;
    // 세로 화면 전체보기는 90도 회전이 걸려 있어 건드리지 않습니다.
    if (fullscreen && rotateFullscreen) return;

    const to = el.getBoundingClientRect();
    if (!to.width || !to.height || !from.width || !from.height) return;

    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    const sy = from.height / to.height;

    // 거의 안 움직였으면 애니메이션할 것도 없습니다.
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
      return;
    }

    const timing = { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

    flipAnimRef.current?.cancel();
    flipAnimRef.current = el.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
        },
        { transformOrigin: "top left", transform: "translate(0px, 0px) scale(1, 1)" },
      ],
      timing
    );

    // 상자를 늘리면 그 안의 영상도 같이 늘어납니다.
    // 특히 펼침(16:9)에서 전체화면(화면 비율)으로 갈 때는 가로세로 비율이 달라서
    // 전환하는 동안 영상이 눈에 띄게 찌그러져 보였어요.
    // 그래서 영상에는 정확히 반대 배율을 걸어 서로 상쇄시킵니다.
    // 결과적으로 영상은 제 모양을 유지한 채, 테두리만 열리듯 커집니다.
    const frame = playerFrameRef.current;
    if (frame && (Math.abs(sx - sy) > 0.01 || Math.abs(sx - 1) > 0.01)) {
      frameAnimRef.current?.cancel();
      frameAnimRef.current = frame.animate(
        [
          { transformOrigin: "top left", transform: `scale(${1 / sx}, ${1 / sy})` },
          { transformOrigin: "top left", transform: "scale(1, 1)" },
        ],
        timing
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimized, fullscreen, selected?.videoId]);

  // 손가락을 놓았을 때 잡아둔 포인터를 풀어줍니다.
  // releasePointerCapture는 이미 풀린 포인터에 부르면 예외를 던집니다.
  // 그 예외가 dragEnd 중간에서 터지면 끌던 상태가 그대로 남아버려서
  // 그 뒤로 스와이프가 통째로 먹통이 됐어요. 그래서 통째로 감쌉니다.
  const releaseDragPointer = (e) => {
    const held = dragPointerRef.current;
    dragPointerRef.current = null;
    try {
      const el = e?.currentTarget || held?.el;
      const id = e?.pointerId ?? held?.id;
      if (el && id != null && el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    } catch (err) {
      // 이미 풀려 있으면 할 일이 없습니다.
    }
  };

  const dragStart = (e) => {
    // 앞선 끌기가 깔끔하게 끝나지 못했을 수 있으니 항상 초기화하고 시작합니다.
    if (dragStartRef.current != null) {
      if (dragRafRef.current) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      clearDragStyle();
    }
    dragStartRef.current = e.clientY;
    dragMovedRef.current = false;
    controlsWereShownRef.current = controlsShownRef.current;
    dragYRef.current = 0;
    dragPointerRef.current = { el: e.currentTarget, id: e.pointerId };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch (err) {
      // 캡처가 안 돼도 끌기는 그대로 동작합니다.
    }
  };

  const dragMove = (e) => {
    if (dragStartRef.current == null) return;
    const moved = e.clientY - dragStartRef.current;
    // 8px 넘게 움직였으면 탭이 아니라 끌기로 봅니다.
    if (Math.abs(moved) > 8) dragMovedRef.current = true;
    dragYRef.current = moved;
    // 화면 주사율에 맞춰 한 번만 그립니다.
    if (dragRafRef.current) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      applyDragStyle(dragYRef.current);
    });
  };

  const dragEnd = (e) => {
    if (dragStartRef.current == null) return;
    dragStartRef.current = null;
    releaseDragPointer(e);
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }

    const y = dragYRef.current;
    dragYRef.current = 0;

    // 전체화면 → 축소화면 → 앱 내 축소화면(작은 창) 순서로 한 단계씩 오르내립니다.
    // 문턱을 넘었으면 changeView가 지금 끌려 있는 위치를 출발점으로 잡아
    // 새 자리까지 끊김 없이 이어서 움직입니다.
    if (minimized) {
      // 작은 창: 위로 올리면 축소화면, 아래로 내리면 닫힘.
      if (y > 60) closePlayer();
      else if (y < -50) changeView({ minimized: false });
      else springBackDragStyle();
    } else if (fullscreen) {
      // 전체화면: 아래로 내리면 축소화면.
      if (y > 100) changeView({ fullscreen: false });
      else springBackDragStyle();
    } else {
      // 축소화면: 위로 올리면 전체화면, 아래로 내리면 작은 창.
      if (y > 100) changeView({ minimized: true });
      else if (y < -80) changeView({ fullscreen: true });
      else springBackDragStyle();
    }
  };

  // 손잡이·제목 영역 어디서든 같은 방식으로 끌 수 있게 묶어둡니다.
  const dragHandlers = {
    onPointerDown: dragStart,
    onPointerMove: dragMove,
    onPointerUp: dragEnd,
    onPointerCancel: dragEnd,
    // 제목을 끌면 글자가 선택됩니다. 그 선택된 글자 위에서 다시 끌면 브라우저가
    // "글자를 끌어다 놓기"를 시작하면서 우리 제스처를 취소해버려요(pointercancel).
    // 그래서 한 번 끈 뒤로 스와이프가 통째로 안 먹히는 일이 생겼습니다.
    // 끌어다 놓기만 막으면 됩니다. 글자 선택·복사는 그대로 됩니다.
    draggable: false,
    onDragStart: (e) => e.preventDefault(),
    style: { touchAction: "none" },
  };

  // ── 안드로이드 앱(Capacitor)과 주고받기 ──────────────
  // 앱으로 감싸지 않은 웹에서는 window.KinexNative가 없으므로 전부 조용히 넘어갑니다.

  // 지금 재생 중인지 앱이 알 수 있게 창에 적어둡니다.
  // 앱은 이 값을 주기적으로 읽어서 PiP로 들어갈지, 알림을 띄워
  // 재생을 이어갈지 판단합니다. 그냥 전역 변수라 앱이 아니어도 아무 문제 없어요.
  useEffect(() => {
    window.kinexPlaying = !!selected && pState.playing;
    window.kinexTitle = selected?.title || "";
    return () => {
      window.kinexPlaying = false;
    };
  }, [selected, pState.playing]);

  // 앱이 PiP로 들어가고 나올 때 알려주는 창구입니다.
  useEffect(() => {
    window.kinexPipChanged = (on) => setPipMode(!!on);
    return () => {
      delete window.kinexPipChanged;
    };
  }, []);

  // 채널 화면으로 들어가면 펼친 플레이어를 작은 창으로 접습니다.
  // 접지 않으면 플레이어가 잡아둔 자리에 그대로 떠 있어서 채널 화면을 가립니다.
  useEffect(() => {
    if (openChannel && selected && !minimized) changeView({ minimized: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChannel]);

  // 접히거나 영상이 바뀌면 끌던 상태를 초기화합니다.
  useEffect(() => {
    dragYRef.current = 0;
    dragStartRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimized, fullscreen, selected?.videoId]);

  // 끌기가 끝났다는 신호를 놓치는 경우가 있습니다.
  // 끌던 도중에 그 요소가 화면에서 사라지거나(작은 창으로 바뀌는 등),
  // 앱이 백그라운드로 넘어가면 우리 손등 위에서 pointerup이 안 옵니다.
  // 그러면 "아직 끌고 있는 중"으로 남아서 다음 스와이프가 통째로 안 먹혀요.
  // 창 전체에서 한 번 더 받아 확실히 풀어줍니다.
  useEffect(() => {
    const finishStuckDrag = () => {
      // 정상적으로 끝났으면 이미 비어 있으니 할 일이 없습니다.
      if (dragStartRef.current == null) return;
      dragStartRef.current = null;
      dragYRef.current = 0;
      if (dragRafRef.current) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      releaseDragPointer(null);
      // 어디로 가려던 건지 알 수 없으니 원래 자리로 되돌리기만 합니다.
      springBackDragStyle();
    };

    window.addEventListener("pointerup", finishStuckDrag);
    window.addEventListener("pointercancel", finishStuckDrag);
    window.addEventListener("blur", finishStuckDrag);
    return () => {
      window.removeEventListener("pointerup", finishStuckDrag);
      window.removeEventListener("pointercancel", finishStuckDrag);
      window.removeEventListener("blur", finishStuckDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 재생목록 ──
  const createPlaylist = (name, firstVideo) => {
    const clean = (name || "").trim();
    if (!clean) return;
    const next = [
      { id: `pl_${Date.now()}`, name: clean, videos: firstVideo ? [firstVideo] : [] },
      ...playlists,
    ];
    setPlaylists(next);
    savePlaylists(next);
    flash(`"${clean}" 재생목록을 만들었어요.`);
  };

  const togglePlaylistVideo = (playlistId, video) => {
    const next = playlists.map((p) => {
      if (p.id !== playlistId) return p;
      const has = p.videos.some((v) => v.videoId === video.videoId);
      return {
        ...p,
        videos: has ? p.videos.filter((v) => v.videoId !== video.videoId) : [video, ...p.videos],
      };
    });
    setPlaylists(next);
    savePlaylists(next);
  };

  const removePlaylist = (playlistId) => {
    const next = playlists.filter((p) => p.id !== playlistId);
    setPlaylists(next);
    savePlaylists(next);
    flash("재생목록을 지웠어요.");
  };

  openVideoRef.current = openVideo;

  const handleSubmitSearch = () => {
    if (!query.trim()) return;
    setOpenChannel(null);
    // 보던 영상은 끄지 않고 작은 창으로 접습니다.
    if (selected) changeView({ minimized: true });
    setActiveNav("홈");
    setCategory("전체");
    runSearch(query.trim(), searchOrder);
  };

  const handleCategoryClick = (c) => {
    setOpenChannel(null);
    if (selected) changeView({ minimized: true });
    setActiveNav("홈");
    setCategory(c.label);
    if (c.id) runCategory(c.id);
    else runHome(subs);
  };

  const handleNavClick = (label) => {
    setActiveNav(label);
    setNavOpen(false);
    // 탭을 옮겨도 보던 영상은 작은 창으로 남깁니다.
    if (selected) changeView({ minimized: true });
    setOpenChannel(null);
    if (label === "숏츠") {
      setError(null);
      if (shorts.length === 0) runShorts();
    } else if (label === "구독") {
      setError(null);
      runSubscriptions(subs);
    } else if (label === "보관함") {
      setError(null);
    } else if (label === "기록") {
      setError(null);
      setHistory(historyForDisplay());
    } else {
      // 홈으로 돌아오면 검색 상태를 완전히 비웁니다.
      // 검색어를 지우지 않으면 검색창에 글자가 남아 있어서
      // 아직 검색 결과를 보고 있는 것처럼 보입니다.
      setQuery("");
      setSearchOrder("relevance");
      setCategory("전체");
      runHome(subs);
    }
  };

  // 안내 문구를 잠깐 띄웠다 지웁니다.
  const flash = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  // 관심 없음은 되돌리기 번거로우니 먼저 물어봅니다.
  const handleMute = (kind, video) => setMuteConfirm({ kind, video });

  const applyMute = ({ kind, video }) => {
    if (kind === "channel") {
      muteChannel(video.channelId);
      setVideos((prev) => prev.filter((x) => x.channelId !== video.channelId));
      flash("이 채널은 추천하지 않을게요.");
    } else {
      muteVideo(video.videoId);
      setVideos((prev) => prev.filter((x) => x.videoId !== video.videoId));
      flash("이 영상을 숨겼어요.");
    }
    setMuteConfirm(null);
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
  //
  // 예전에는 화면(뷰포트) 기준 좌표를 써서, 스크롤할 때마다 자리를 다시 재고
  // 상태를 바꿔 화면 전체를 다시 그렸습니다. 그래서 스크롤이 뚝뚝 끊겼어요.
  // 이제는 문서(페이지) 기준 좌표로 한 번만 재두고 position:absolute로 놓습니다.
  // 그러면 스크롤은 브라우저가 알아서 처리해서 자바스크립트가 전혀 끼어들지 않습니다.
  // 팝업·분할 화면처럼 창 크기가 바뀔 때만 다시 잽니다.
  useEffect(() => {
    if (!selected || minimized || fullscreen) {
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
        // 스크롤한 만큼을 더해 문서 기준 좌표로 바꿉니다.
        const top = r.top + window.scrollY;
        const left = r.left + window.scrollX;
        // 값이 그대로면 상태를 갱신하지 않습니다. 갱신하면 다시 그려지고,
        // 그게 또 측정을 부르면서 무한 반복이 됩니다.
        setSlotRect((prev) => {
          if (
            prev &&
            Math.abs(prev.top - top) < 0.5 &&
            Math.abs(prev.left - left) < 0.5 &&
            Math.abs(prev.width - r.width) < 0.5 &&
            Math.abs(prev.height - r.height) < 0.5
          ) {
            return prev;
          }
          return { top, left, width: r.width, height: r.height };
        });
      });
    };

    measure();

    // 자리 자체가 커지거나(창 크기 변경), 위쪽 내용이 늘어나 자리가 밀릴 때만 다시 잽니다.
    const ro = new ResizeObserver(measure);
    if (slotRef.current) ro.observe(slotRef.current);
    if (slotRef.current?.parentElement) ro.observe(slotRef.current.parentElement);

    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [selected, minimized, fullscreen]);

  // 유튜브 플레이어가 보내주는 재생 위치를 받아 진행률로 저장합니다.
  // enablejsapi=1 상태에서 "listening"을 보내면 주기적으로 알려줘요.
  useEffect(() => {
    if (!selected) return;

    const onMessage = (e) => {
      if (!e.origin.includes("youtube.com")) return;
      let data;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch (err) {
        return;
      }
      const info = data?.info;
      if (!info) return;

      if (typeof info.currentTime === "number" && typeof info.duration === "number") {
        // 받은 시각도 같이 적어둡니다. 다음 소식이 늦게 와도 흐른 시간을 더해
        // 실제 위치를 추정할 수 있어요.
        playerTimeRef.current = {
          current: info.currentTime,
          duration: info.duration,
          at: Date.now(),
        };
        saveProgress(selected.videoId, info.currentTime, info.duration);
        // 끝났다는 신호가 안 오는 경우가 있어 남은 시간으로도 판단합니다.
        if (info.duration > 0 && info.duration - info.currentTime <= 0.8) setEnded(true);
      }

      // 유튜브가 알려주는 재생 상태를 우리 컨트롤에 반영합니다.
      setPState((prev) => {
        const next = { ...prev };
        // 컨트롤이 숨겨져 있으면 시간 표시를 갱신하지 않습니다.
        // 갱신하면 초당 몇 번씩 화면 전체가 다시 그려져서 버벅여요.
        if (typeof info.currentTime === "number" && controlsShownRef.current) {
          next.current = info.currentTime;
        }
        if (typeof info.duration === "number" && info.duration > 0) next.duration = info.duration;
        if (typeof info.volume === "number") next.volume = info.volume;
        if (typeof info.muted === "boolean") next.muted = info.muted;
        if (typeof info.playbackRate === "number") next.rate = info.playbackRate;
        if (Array.isArray(info.availablePlaybackRates) && info.availablePlaybackRates.length) {
          next.rates = info.availablePlaybackRates;
        }
        // 1 = 재생중, 2 = 일시정지, 0 = 끝
        if (info.playerState === 1) next.playing = true;
        else if (info.playerState === 2 || info.playerState === 0) next.playing = false;
        if (info.playerState === 0) setEnded(true);
        else if (info.playerState === 1) setEnded(false);
        if (typeof info.playerState === "number") {
          // 2 = 일시정지일 때만 멈춤으로 봅니다.
          // 버퍼링(3)까지 멈춤으로 치면 컨트롤이 영영 안 사라져요.
          pausedRef.current = info.playerState === 2;
          if (info.playerState === 1) setStarted(true);
        }

        // 값이 그대로면 갱신하지 않습니다 (불필요한 다시 그리기 방지).
        const same =
          Math.floor(next.current) === Math.floor(prev.current) &&
          next.duration === prev.duration &&
          next.volume === prev.volume &&
          next.muted === prev.muted &&
          next.rate === prev.rate &&
          next.playing === prev.playing &&
          next.rates.length === prev.rates.length;
        return same ? prev : next;
      });
    };

    window.addEventListener("message", onMessage);

    // 플레이어가 준비될 때까지 몇 번 시도하고, 이후에도 주기적으로 다시 붙입니다.
    // 연결이 끊기면 끝났다는 신호를 못 받아 유튜브 종료 화면이 그대로 보이게 됩니다.
    const startListening = () => {
      playerFrameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: "loop-player" }),
        "*"
      );
    };
    const timers = [300, 900, 2000].map((ms) => setTimeout(startListening, ms));
    const keepAlive = setInterval(startListening, 5000);

    // 기기 설정 때문에 자막이 저절로 켜지는 경우가 있어, 켠 적이 없으면 내려둡니다.
    if (!captionsOnRef.current) {
      [700, 1600, 3000].forEach((ms) =>
        timers.push(
          setTimeout(() => {
            ["captions", "cc"].forEach((mod) =>
              playerFrameRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: "command", func: "unloadModule", args: [mod] }),
                "*"
              )
            );
          }, ms)
        )
      );
    }

    return () => {
      window.removeEventListener("message", onMessage);
      timers.forEach(clearTimeout);
      clearInterval(keepAlive);
    };
  }, [selected]);

  const playerCommand = useCallback((func, args = []) => {
    playerFrameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*"
    );
  }, []);

  const togglePlay = useCallback(() => {
    setPState((p) => {
      const nowPlaying = !p.playing;
      playerCommand(p.playing ? "pauseVideo" : "playVideo");
      pausedRef.current = !nowPlaying;
      return { ...p, playing: nowPlaying };
    });
  }, [playerCommand]);

  const setVolume = useCallback(
    (v) => {
      playerCommand("setVolume", [v]);
      if (v > 0) playerCommand("unMute");
      setPState((p) => ({ ...p, volume: v, muted: v === 0 }));
    },
    [playerCommand]
  );

  const toggleMute = useCallback(() => {
    setPState((p) => {
      playerCommand(p.muted ? "unMute" : "mute");
      return { ...p, muted: !p.muted };
    });
  }, [playerCommand]);

  const setRate = useCallback(
    (r) => {
      playerCommand("setPlaybackRate", [r]);
      setPState((p) => ({ ...p, rate: r }));
      setSpeedOpen(false);
    },
    [playerCommand]
  );

  // 지금 재생 위치를 추정합니다. 마지막으로 받은 값에 그 뒤로 흐른 시간을 더합니다.
  const estimateTime = useCallback(() => {
    const { current = 0, duration = 0, at = 0 } = playerTimeRef.current || {};
    if (!at) return current;
    const elapsed = pausedRef.current ? 0 : (Date.now() - at) / 1000;
    const rate = pState.rate || 1;
    return Math.min(duration || Infinity, current + elapsed * rate);
  }, [pState.rate]);

  // 자막 켜고 끄기.
  // 명령어(loadModule)는 잘 안 먹어서, 주소에 담아 그 지점부터 다시 여는 방식을 씁니다.
  const toggleCaptions = useCallback(() => {
    setResumeAt(Math.max(0, Math.floor(estimateTime()) - 1));
    const next = !captionsOn;
    setCaptionsOn(next);
    // 명령어가 먹는 플레이어라면 그쪽으로도 같이 시도합니다.
    // 모듈 이름이 기기마다 달라 둘 다 보냅니다.
    ["captions", "cc"].forEach((mod) => {
      playerCommand(next ? "loadModule" : "unloadModule", [mod]);
      // 끌 때는 선택된 자막 트랙도 비워야 확실히 사라집니다.
      if (!next) playerCommand("setOption", [mod, "track", {}]);
    });
  }, [playerCommand, captionsOn, estimateTime]);

  // 자막 크기. -1(작게) ~ 3(아주 크게)
  const changeCaptionSize = useCallback(
    (size) => {
      setCaptionSize(size);
      // 자막 크기는 명령어로 바꿀 수 있습니다. 모듈 이름이 플레이어마다 달라 둘 다 시도합니다.
      ["captions", "cc"].forEach((mod) => {
        playerCommand("setOption", [mod, "fontSize", size]);
      });
    },
    [playerCommand]
  );

  // 화질 요청. 유튜브가 무시할 수 있어 "요청"에 가깝습니다.
  const changeQuality = useCallback(
    (q) => {
      setResumeAt(Math.max(0, Math.floor(estimateTime()) - 1));
      setQuality(q);
    },
    [estimateTime]
  );

  const [playerShared, setPlayerShared] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  // 관심 없음을 누르면 여기 담아두고 확인 창을 띄웁니다.
  const [muteConfirm, setMuteConfirm] = useState(null);

  // 기기의 공유 시트를 띄웁니다. 카톡·메시지 등으로 바로 보낼 수 있어요.
  // 공유 시트를 못 쓰는 환경에서만 링크 복사 창으로 넘어갑니다.
  const shareVideo = useCallback(async (video) => {
    if (!video) return;
    const link = `https://www.youtube.com/watch?v=${video.videoId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: video.title, text: video.title, url: link });
        return;
      } catch (e) {
        // 사용자가 취소한 경우엔 아무것도 하지 않습니다.
        if (e?.name === "AbortError") return;
      }
    }
    setShareTarget(video);
  }, []);

  const sharePlaying = useCallback(() => {
    if (selected) shareVideo(selected);
  }, [selected, shareVideo]);

  const doCopyLink = useCallback(async (video) => {
    const link = `https://www.youtube.com/watch?v=${video.videoId}`;
    try {
      await navigator.clipboard.writeText(link);
      setPlayerShared(true);
      setTimeout(() => setPlayerShared(false), 1600);
      flash("링크를 복사했어요.");
    } catch (e) {
      window.prompt("아래 링크를 복사하세요", link);
    }
    setShareTarget(null);
  }, []);

  const seekToTime = useCallback(
    (t) => {
      playerCommand("seekTo", [t, true]);
      playerTimeRef.current = { ...playerTimeRef.current, current: t };
      setPState((p) => ({ ...p, current: t }));
    },
    [playerCommand]
  );

  // 목록 안에서 지금 몇 번째인지. 이전/다음 버튼이 이걸 기준으로 움직입니다.
  const queueIndex = selected ? queue.findIndex((x) => x.videoId === selected.videoId) : -1;
  // 목록 끝이면 "다음 영상" 추천에서 이어갑니다.
  const nextVideo =
    queueIndex >= 0 && queueIndex < queue.length - 1 ? queue[queueIndex + 1] : related[0] || null;
  const prevVideo = queueIndex > 0 ? queue[queueIndex - 1] : null;

  const goPrev = () => {
    if (prevVideo) openVideo(prevVideo, queue);
  };

  const goNext = () => {
    if (!nextVideo) return;
    // 추천에서 이어가는 경우엔 그 추천 목록을 새 재생 목록으로 삼습니다.
    openVideo(nextVideo, queueIndex >= 0 && queueIndex < queue.length - 1 ? queue : related);
  };

  // 10초 건너뛰기. seekTo로 위치를 직접 지정하면 중간 구간을 스쳐 지나가지 않고 바로 점프합니다.
  const skip = useCallback(
    (delta) => {
      const duration = playerTimeRef.current?.duration || 0;
      const target = Math.max(0, Math.min(duration || Infinity, estimateTime() + delta));
      playerCommand("seekTo", [target, true]);
      playerCommand("playVideo");
      playerTimeRef.current = { current: target, duration, at: Date.now() };
      setPState((p) => ({ ...p, current: target }));
    },
    [playerCommand, estimateTime]
  );

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
      // 목록 관련 캐시만 지웁니다. 재생 중인 영상의 댓글·채널 정보까지 지우면
      // 화면이 다시 그려지면서 흔들려요.
      Object.keys(sessionStorage)
        .filter((k) => /^loop:(popular|search|shortsCat|shorts)/.test(k))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch (e) {
      // 접근이 막혀 있으면 그냥 다시 불러옵니다.
    }

    // 보고 있던 영상은 그대로 둡니다. 목록만 새로 받아와요.
    // 채널 페이지는 키를 바꿔 다시 불러오게 합니다.
    setRefreshKey((k) => k + 1);

    if (activeNav === "숏츠") {
      setShorts([]);
      setShortsIndex(0);
      runShorts();
    } else if (activeNav === "구독") {
      setSubChannels([]);
      runSubscriptions(subs);
    } else if (activeNav === "보관함" || activeNav === "기록") {
      // 저장·기록 목록은 서버에서 받아오는 게 아니라 새로고침할 게 없습니다.
    } else if (source.kind === "search") {
      runSearch(source.query, source.order || "relevance");
    } else if (source.kind === "category") {
      runCategory(source.categoryId);
    } else {
      runHome(subs);
    }
  }, [activeNav, source, subs, runShorts, runSubscriptions, runSearch, runCategory, runHome]);

  // 좌우 방향키로도 10초씩 건너뜁니다.
  useEffect(() => {
    if (!selected || activeNav === "숏츠") return;
    const onKey = (e) => {
      // 검색창에 입력 중일 때는 무시합니다.
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        skip(10);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skip(-10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, activeNav, skip]);

  // 이어폰·블루투스 연결이 끊기면 재생을 멈춥니다.
  //
  // 유튜브 영상은 iframe 안에 있어서 안드로이드가 알아서 멈춰주지 않습니다.
  // 대신 소리 없는 짧은 오디오를 같이 재생해 두면, 연결이 끊길 때
  // 안드로이드가 그 오디오를 자동으로 멈춥니다. 그 순간을 신호로 삼아요.
  // (MainActivity를 고쳐두면 더 정확하게 동작합니다 — BLUETOOTH.md 참고)
  useEffect(() => {
    if (!selected || minimized === undefined) return;

    const pauseNow = () => {
      playerCommand("pauseVideo");
      setPState((p) => ({ ...p, playing: false }));
      pausedRef.current = true;
      showControls();
    };

    // 안드로이드 쪽에서 직접 부를 수도 있게 열어둡니다.
    window.kinexAudioBecomingNoisy = pauseNow;

    const silent = new Audio(SILENT_SOUND);
    silent.loop = true;
    silent.volume = 0.0001;
    let stopped = false;

    const start = () => {
      if (stopped) return;
      silent.play().catch(() => {
        // 자동 재생이 막힌 경우엔 이 방식이 동작하지 않습니다.
      });
    };

    const onPause = () => {
      if (stopped) return;
      // 화면이 꺼졌거나 앱을 벗어난 경우는 제외합니다.
      if (document.hidden) return;
      pauseNow();
      // 다음에 또 감지할 수 있도록 잠시 뒤 다시 켭니다.
      setTimeout(start, 800);
    };

    silent.addEventListener("pause", onPause);
    start();

    return () => {
      stopped = true;
      silent.removeEventListener("pause", onPause);
      silent.pause();
      silent.src = "";
      if (window.kinexAudioBecomingNoisy === pauseNow) delete window.kinexAudioBecomingNoisy;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.videoId]);

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
    fullscreen,
    source,
    handleNavClick,
    changeView,
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
      } else if (state.fullscreen) {
        // 전체화면 → 축소화면
        state.changeView({ fullscreen: false });
      } else if (state.selected && !state.minimized) {
        // 축소화면 → 작은 창
        state.changeView({ minimized: true });
      } else if (state.selected) {
        // 작은 창 → 닫기
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
    activeNav === "보관함" ? savedVideos : activeNav === "기록" ? history : videos;
  displayListRef.current = displayList;

  useEffect(() => {
    // 목록이 화면에 그려진 뒤에 프로필 사진을 요청합니다.
    const t = setTimeout(() => loadAvatars(displayList), 300);
    return () => clearTimeout(t);
  }, [displayList, loadAvatars]);

  // 스크롤이 목록 끝에 닿으면 다음 페이지를 이어붙입니다.
  // 보관함은 저장된 것만 보여주므로 더 불러올 게 없습니다.
  const loadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore || loading || activeNav === "보관함" || activeNav === "기록")
      return;
    setLoadingMore(true);
    try {
      const res =
        source.kind === "search"
          ? await searchYoutube(source.query, nextPageToken, undefined, source.order || "relevance")
          : await fetchPopular("KR", nextPageToken, source.categoryId || null);
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.videoId));
        let fresh = res.items.filter((v) => !seen.has(v.videoId));
        // 처음 불러올 때와 같은 기준을 적용합니다.
        // 안 그러면 스크롤할수록 걸러냈던 숏츠·음악·본 영상이 다시 섞여요.
        if (source.kind !== "search") {
          fresh = rankVideos(tidyForHome(fresh, 0), buildTaste(), subs);
        }
        return [...prev, ...fresh];
      });
      setNextPageToken(res.nextPageToken);
    } catch (e) {
      // 더 불러오기 실패는 기존 목록을 건드리지 않고 조용히 멈춥니다.
      setNextPageToken(null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextPageToken, loadingMore, loading, activeNav, source, subs]);

  // 감시 지점이 화면에서 사라졌다 다시 생길 때(영상을 열었다 닫을 때 등)
  // 예전 자리를 계속 보고 있으면 스크롤을 감지하지 못합니다.
  // 그래서 요소가 붙고 떨어질 때마다 감시를 새로 겁니다.
  const observerRef = useRef(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const sentinelRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreRef.current?.();
      },
      { rootMargin: "400px" }
    );
    observerRef.current.observe(node);
  }, []);

  // 화면을 벗어나면 감시를 정리합니다.
  useEffect(() => () => observerRef.current?.disconnect(), []);

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
        const channelVideos = await fetchChannelVideoList(selected.channelId);
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
    <div
      className={pipMode ? "pip-mode" : undefined}
      style={{ minHeight: "100vh", background: "#0E0D0B", fontFamily: "'Inter', sans-serif" }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@400;600&family=IBM+Plex+Mono:wght@400&display=swap"
        rel="stylesheet"
      />

      <div
        className="top-bar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 24px",
          // 반투명 + 흐림(backdrop-filter)은 스크롤할 때마다 상단 바 뒤쪽을
          // 매번 다시 칠해야 해서 태블릿에서 특히 무겁습니다.
          // 어차피 92% 불투명이라 흐림 효과는 거의 안 보였어요. 불투명으로 바꿉니다.
          background: "#0E0D0B",
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
          <img
            src="/logo.png"
            alt=""
            style={{ height: 26, width: "auto", display: "block" }}
          />
          <span
            className="logo-text"
            style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, color: "#F2EDE4", letterSpacing: -0.5 }}
          >
            키넥스
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
                  width: "min(320px, calc(100vw - 24px))",
                  maxHeight: "min(420px, 60vh)",
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
                        openVideo(v, subFeed);
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
                        loading="lazy"
                        decoding="async"
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
                            fontFamily: "'Inter', sans-serif",
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
                  width: "min(268px, calc(100vw - 24px))",
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
                      fontFamily: "'Inter', sans-serif",
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
                  label="시청 기록 지우기"
                  hint="기록 탭이 비워지고, 진행률 막대도 사라집니다"
                  onClick={() => {
                    clearProgress();
                    clearHistory();
                    setHistory([]);
                    flash("시청 기록을 지웠어요.");
                    setShowMenu(false);
                  }}
                />
                <MenuItem
                  icon={RotateCcw}
                  label="추천 초기화"
                  hint="관심 없음 표시와 채널·카테고리 선호도를 모두 지웁니다"
                  onClick={() => {
                    clearMuted();
                    clearTopicScores();
                    flash("추천을 초기화했어요.");
                    setShowMenu(false);
                  }}
                />
                <MenuItem
                  icon={Trash2}
                  label="숏츠에서 본 영상 기록 지우기"
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
                fontWeight: 600,
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
              key={`${openChannel}:${refreshKey}`}
              channelId={openChannel}
              onBack={() => setOpenChannel(null)}
              onSelect={(v, list) => openVideo(v, list)}
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
          ) : (
            <>
            {selected && !minimized && (
            <PlayerView
              v={selected}
              related={related}
              onBack={() => changeView({ minimized: true })}
              onMinimize={() => changeView({ minimized: true })}
              slotRef={slotRef}
              seekTo={seekTo}
              dragHandlers={dragHandlers}
              onAddToPlaylist={(video) => setPlaylistTarget(video)}
              onShare={shareVideo}
              shared={playerShared}
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
                  openVideo(fullVideo, related);
                } else {
                  openVideo({ videoId, title: "직접 불러온 영상", channelTitle: "", views: "", description: "" });
                }
              }}
            />
            )}

            {/* 목록은 영상을 펼쳐도 지우지 않고 숨기기만 합니다.
                지웠다가 다시 만들면 카드 수십 개를 새로 그리느라
                접기·펼치기 애니메이션 첫 순간이 뚝 끊겨요. */}
            <div
              className="page-pad"
              style={{
                padding: "20px 28px 60px",
                display: selected && !minimized ? "none" : undefined,
              }}
            >
              {activeNav === "기록" ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    paddingBottom: 18,
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600, color: "#F2EDE4" }}>
                    시청 기록
                    <span style={{ color: "#8C8578", fontFamily: "'Inter', sans-serif", fontSize: 13, marginLeft: 10, fontWeight: 400 }}>
                      {history.length}개
                    </span>
                  </div>
                  {history.length > 0 && (
                    <button
                      onClick={() => {
                        clearHistory();
                        clearProgress();
                        setHistory([]);
                        flash("시청 기록을 지웠어요.");
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "#231F19",
                        border: "none",
                        borderRadius: 18,
                        color: "#B8B2A4",
                        padding: "7px 14px",
                        fontSize: 12.5,
                        cursor: "pointer",
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      <Trash2 size={14} /> 기록 지우기
                    </button>
                  )}
                </div>
              ) : activeNav === "구독" ? (
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
                  <span style={{ color: "#8C8578", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 400 }}>
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
                  <span style={{ color: "#8C8578", fontFamily: "'Inter', sans-serif", fontSize: 13, marginLeft: 10 }}>
                    {savedVideos.length}개
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 18 }}>
                  {source.kind === "search"
                    ? [
                        ["relevance", "관련순"],
                        ["viewCount", "인기순"],
                        ["date", "최신순"],
                      ].map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => {
                            setSearchOrder(val);
                            runSearch(source.query, val);
                          }}
                          style={{
                            flexShrink: 0,
                            padding: "8px 16px",
                            borderRadius: 18,
                            border: "1px solid " + (searchOrder === val ? "#E8A33D" : "#2C271F"),
                            background: searchOrder === val ? "#E8A33D" : "transparent",
                            color: searchOrder === val ? "#17140F" : "#B8B2A4",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "'Inter', sans-serif",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {label}
                        </button>
                      ))
                    : CATEGORIES.map((c) => (
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

              {loading && activeNav !== "보관함" && activeNav !== "기록" && (
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
                  <Loader2 size={18} className="spin" /> 영상 불러오는 중…
                </div>
              )}

              {!loading && error && activeNav !== "보관함" && activeNav !== "기록" && (
                <div style={{ color: "#B85C4F", textAlign: "center", padding: "80px 20px", fontFamily: "'Inter', sans-serif", fontSize: 13.5 }}>
                  {error}
                  <div style={{ color: "#8C8578", fontSize: 12, marginTop: 8 }}>
                    서버에 API 키가 설정되어 있는지, YouTube Data API v3가 활성화되어 있는지 확인해주세요.
                  </div>
                </div>
              )}

              {activeNav === "보관함" && !loading && !error && (
                <div style={{ marginBottom: 26 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        color: "#F2EDE4",
                        fontFamily: "'Fraunces', serif",
                        fontSize: 16,
                        fontWeight: 600,
                      }}
                    >
                      재생목록
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          createPlaylist(newPlaylistName);
                          setNewPlaylistName("");
                        }}
                        placeholder="새 재생목록 이름"
                        style={{
                          background: "#0E0D0B",
                          border: "1px solid #2C271F",
                          borderRadius: 8,
                          color: "#F2EDE4",
                          padding: "8px 11px",
                          fontSize: 12.5,
                          outline: "none",
                          fontFamily: "'Inter', sans-serif",
                          width: 160,
                        }}
                      />
                      <button
                        onClick={() => {
                          createPlaylist(newPlaylistName);
                          setNewPlaylistName("");
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          background: "#E8A33D",
                          border: "none",
                          borderRadius: 8,
                          color: "#17140F",
                          padding: "0 13px",
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        <ListPlus size={14} /> 만들기
                      </button>
                    </div>
                  </div>

                  {playlists.length === 0 && (
                    <div style={{ color: "#5C574C", fontSize: 12.5, paddingBottom: 4 }}>
                      아직 재생목록이 없어요. 이름을 적고 만들어보세요.
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                    {playlists.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          border: "1px solid #231F19",
                          borderRadius: 12,
                          padding: 12,
                          minWidth: 0,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div
                            onClick={() => p.videos[0] && openVideo(p.videos[0], p.videos)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              minWidth: 0,
                              cursor: p.videos.length ? "pointer" : "default",
                            }}
                          >
                            <ListVideo size={16} style={{ color: "#E8A33D", flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  color: "#F2EDE4",
                                  fontSize: 13.5,
                                  fontWeight: 600,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {p.name}
                              </div>
                              <div style={{ color: "#8C8578", fontSize: 11.5, fontFamily: "'Inter', sans-serif" }}>
                                영상 {p.videos.length}개
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => removePlaylist(p.id)}
                            title="재생목록 지우기"
                            style={{ background: "none", border: "none", color: "#5C574C", cursor: "pointer", display: "flex", flexShrink: 0 }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
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
                              fontFamily: "'Inter', sans-serif",
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

              {activeNav !== "구독" &&
                !loading &&
                !error &&
                displayList.length === 0 &&
                !(activeNav === "보관함" && playlists.length > 0) && (
                <div style={{ color: "#8C8578", textAlign: "center", padding: "80px 0", fontFamily: "'Inter', sans-serif" }}>
                  {activeNav === "보관함"
                    ? "저장한 영상이 아직 없어요. 영상을 열고 저장을 눌러보세요."
                    : activeNav === "기록"
                    ? "아직 본 영상이 없어요."
                    : "검색 결과가 없어요."}
                </div>
              )}

              {activeNav !== "구독" && !loading && !error && displayList.length > 0 && (
                <VideoGrid
                  items={displayList}
                  avatars={avatars}
                  onSelect={selectFromList}
                  onOpenChannel={setOpenChannel}
                  onMute={activeNav === "홈" ? handleMute : undefined}
                />
              )}

              {activeNav !== "보관함" && activeNav !== "구독" && activeNav !== "기록" && !loading && !error && (
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

              {!loadingMore && !nextPageToken && !loading && !error && displayList.length > 0 && activeNav !== "보관함" && activeNav !== "구독" && activeNav !== "기록" && (
                <div style={{ textAlign: "center", color: "#5C574C", padding: "36px 0", fontSize: 12.5, fontFamily: "'Inter', sans-serif" }}>
                  마지막 영상이에요
                </div>
              )}
            </div>
            </>
          )}
        </div>
      </div>

      {/* 영상 플레이어. 화면을 옮겨도 이 iframe은 그대로 살아 있어서 재생이 안 끊깁니다.
          펼친 상태에선 PlayerView가 잡아둔 자리에, 접으면 오른쪽 아래 작은 창으로 갑니다. */}
      {selected && (minimized || fullscreen || slotRect) && (
        <div
          ref={playerBoxRef}
          className={
            minimized
              ? "player-box mini-player"
              : fullscreen
              ? "player-box " + (rotateFullscreen ? "player-fs-rot" : "player-fs")
              : "player-box"
          }
          onPointerMove={() => {
            // 끌고 있는 중이거나 이미 보이는 중이면 아무것도 하지 않습니다.
            if (dragStartRef.current != null || controlsShown) return;
            showControls();
          }}
          style={
            pipMode
              ? {
                  // PiP 창 안에서는 영상만 꽉 채웁니다.
                  position: "fixed",
                  inset: 0,
                  width: "100vw",
                  height: "100vh",
                  background: "#000",
                  zIndex: 999,
                  overflow: "hidden",
                }
              : fullscreen
              ? {
                  // 브라우저에 미리 알려주면 움직임이 더 매끄럽습니다.
                  willChange: "transform, opacity",
                  position: "fixed",
                  inset: 0,
                  // 세로로 든 폰에서는 90도 돌려 화면을 꽉 채웁니다.
                  width: rotateFullscreen ? "100vh" : "100vw",
                  height: rotateFullscreen ? "100vw" : "100vh",
                  top: rotateFullscreen ? "50%" : 0,
                  left: rotateFullscreen ? "50%" : 0,
                  transformOrigin: "center",
                  background: "#000",
                  zIndex: 90,
                  overflow: "hidden",
                  transform: rotateFullscreen ? "translate(-50%, -50%) rotate(90deg)" : undefined,
                }
              : minimized
              ? {
                  willChange: "transform, opacity",
                  position: "fixed",
                  right: 16,
                  bottom: 16,
                  // 좁은 화면에서는 아래 탭 바 위로 올라갑니다 (.mini-player)
                  // 유튜브 정책상 임베드 플레이어는 200x200px 아래로 줄이면 안 됩니다.
                  // 좁은 화면에서도 넘치지 않게 합니다.
                  // 다만 유튜브 정책상 200x200px 아래로는 줄이지 않습니다.
                  width: "min(360px, calc(100vw - 24px))",
                  height: 202,
                  minWidth: 200,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#000",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.65)",
                  border: "1px solid #2C271F",
                  zIndex: 70,
                }
              : {
                  // 문서 기준 좌표라서 스크롤은 브라우저가 알아서 처리합니다.
                  position: "absolute",
                  top: slotRect.top,
                  left: slotRect.left,
                  width: slotRect.width,
                  height: slotRect.height,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#000",
                  // 상단 바(20)보다 낮게 둬서 스크롤하면 상단 바 아래로 지나갑니다.
                  zIndex: 15,
                  transformOrigin: "center",
                }
          }
        >
          <iframe
            key={selected.videoId}
            ref={playerFrameRef}
            src={`https://www.youtube.com/embed/${selected.videoId}?rel=0&enablejsapi=1&autoplay=1&fs=0&playsinline=1&controls=0&iv_load_policy=3&modestbranding=1&showinfo=0${
              captionsOn ? "&cc_load_policy=1&cc_lang_pref=ko" : "&cc_load_policy=0"
            }${quality !== "auto" ? `&vq=${quality}` : ""}${
              resumeAt ? `&start=${resumeAt}` : ""
            }`}
            title={selected.title}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              // 재생이 시작된 뒤에는 우리가 컨트롤을 그리므로 터치를 받지 않습니다.
              // 다만 아이폰은 자동 재생을 막아서, 시작 전에는 유튜브 재생 버튼을
              // 직접 누를 수 있도록 터치를 넘겨줍니다.
              pointerEvents: started ? "none" : "auto",
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
          />

          {/* 영상 전체가 우리 영역입니다. 어디서든 아래로 쓸어내리면 접히고,
              화면을 셋으로 나눠 왼쪽은 10초 뒤로, 오른쪽은 10초 앞으로,
              가운데는 컨트롤 표시입니다. */}
          {!minimized && started && (
            <div
              {...dragHandlers}
              onClick={(e) => {
                // 끌었을 때는 탭으로 보지 않습니다.
                if (dragMovedRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const zone = x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : "mid";
                const now = Date.now();
                const last = lastTapRef.current;
                // 같은 쪽을 400ms 안에 다시 누르면 건너뜁니다.
                const isDouble = zone !== "mid" && last.zone === zone && now - last.at < 400;

                if (isDouble) {
                  skip(zone === "left" ? -10 : 10);
                  showControls();
                  // 이어서 또 누르면 계속 건너뛸 수 있게 시각을 갱신합니다.
                  lastTapRef.current = { zone, at: now };
                  return;
                }

                lastTapRef.current = { zone, at: now };
                // 한 번 누른 건 컨트롤 표시입니다.
                if (controlsWereShownRef.current) hideControls();
                else showControls();
              }}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                touchAction: "none",
                cursor: "pointer",
              }}
            />
          )}

          {/* 재생이 시작되기 전에는 유튜브 로딩 화면(로고·제목·동영상 더보기)이 보입니다.
              끌 수 없으므로 영상 썸네일로 덮어 가립니다. */}
          {!minimized && !started && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                background: "#000",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {selected.thumbnail && (
                <img
                  src={selected.thumbnail}
                  alt=""
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    opacity: 0.5,
                  }}
                />
              )}
              {needsTap ? (
                // 자동 재생이 막힌 기기용 안내입니다. 덮개가 터치를 통과시키므로
                // 사용자가 이 자리를 그대로 누르면 유튜브 플레이어가 탭을 받습니다.
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: "50%",
                      background: "rgba(232,163,61,0.92)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    <Play size={26} color="#17140F" fill="#17140F" style={{ marginLeft: 3 }} />
                  </div>
                  <div
                    style={{
                      color: "#F2EDE4",
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13.5,
                      fontWeight: 500,
                      textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                    }}
                  >
                    화면을 눌러 재생하세요
                  </div>
                </div>
              ) : (
                <Loader2 size={26} className="spin" color="#F2EDE4" style={{ position: "relative" }} />
              )}
            </div>
          )}

          {/* 일시정지하면 유튜브가 "동영상 더보기" 격자와 로고를 띄웁니다.
              이걸 끄는 방법이 없어서 어두운 층으로 덮어 가립니다. */}
          {!minimized && started && !ended && !pState.playing && (
            <div
              // 이 덮개는 화면 전체를 가리므로, 여기서도 쓸어내려 접을 수 있어야 합니다.
              // 예전에는 포인터를 여기서 막아버려서 일시정지 중에는 스와이프가 안 먹혔어요.
              {...dragHandlers}
              onClick={(e) => {
                e.stopPropagation();
                // 끌었을 때는 재생/정지 전환으로 보지 않습니다.
                if (dragMovedRef.current) return;
                togglePlay();
              }}
              style={{
                ...dragHandlers.style,
                position: "absolute",
                inset: 0,
                zIndex: 3,
                background: "rgba(10,9,8,0.72)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
            </div>
          )}

          {/* 영상이 끝나면 우리 종료 화면을 띄웁니다.
              유튜브 종료 화면을 누르면 앱 밖으로 나가버려서 대신 만들었어요. */}
          {!minimized && ended && (
            <div
              // 종료 화면에서도 쓸어내려 접을 수 있게 합니다.
              {...dragHandlers}
              onClick={(e) => e.stopPropagation()}
              style={{
                ...dragHandlers.style,
                position: "absolute",
                inset: 0,
                zIndex: 6,
                background: "rgba(10,9,8,0.92)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  onClick={() => {
                    playerCommand("seekTo", [0, true]);
                    playerCommand("playVideo");
                    setEnded(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    background: "#231F19",
                    border: "none",
                    borderRadius: 20,
                    color: "#F2EDE4",
                    padding: "9px 16px",
                    fontSize: 12.5,
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <RotateCw size={15} /> 다시 보기
                </button>
                <span style={{ color: "#8C8578", fontSize: 12.5, fontFamily: "'Inter', sans-serif" }}>
                  {related.length > 0 ? "다음 영상" : "재생이 끝났어요"}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  justifyContent: "center",
                  maxWidth: "100%",
                }}
              >
                {related.slice(0, 3).map((r) => (
                  <div
                    key={r.videoId}
                    onClick={() => openVideo(r, related)}
                    style={{ width: 156, cursor: "pointer" }}
                  >
                    <img
                      src={r.thumbnail}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: "100%",
                        aspectRatio: "16/9",
                        objectFit: "cover",
                        borderRadius: 8,
                        display: "block",
                        background: "#231F19",
                      }}
                    />
                    <div
                      style={{
                        color: "#F2EDE4",
                        fontSize: 12,
                        lineHeight: 1.35,
                        marginTop: 6,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {r.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 가운데 재생/일시정지 버튼. 재생이 시작된 뒤에만 나옵니다.
              시작 전에 띄우면 유튜브 재생 버튼을 가려서 아예 재생이 안 됩니다. */}
          {!minimized && !pipMode && started && !ended && (
            <button
              // 일시정지하면 이 버튼이 화면 한가운데를 차지합니다.
              // 여기서 시작하는 쓸어내리기도 받아줘야 자연스러워요.
              {...dragHandlers}
              onClick={(e) => {
                e.stopPropagation();
                // 끌었을 때는 눌렀다고 보지 않습니다.
                if (dragMovedRef.current) return;
                togglePlay();
                showControls();
              }}
              style={{
                ...dragHandlers.style,
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 4,
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                border: "none",
                color: "#F2EDE4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                opacity: controlsShown || !pState.playing ? 1 : 0,
                pointerEvents: controlsShown || !pState.playing ? "auto" : "none",
                transition: `opacity ${MOTION.base}`,
              }}
            >
              {pState.playing ? (
                <Pause size={26} fill="#F2EDE4" />
              ) : (
                <Play size={26} fill="#F2EDE4" style={{ marginLeft: 3 }} />
              )}
            </button>
          )}

          {!minimized && !pipMode && started && (
            <PlayerControls
              p={pState}
              visible={controlsShown}
              fullscreen={fullscreen}
              captionsOn={captionsOn}
              speedOpen={speedOpen}
              setSpeedOpen={setSpeedOpen}
              scrubbing={scrubbing}
              setScrubbing={setScrubbing}
              onPlayPause={() => {
                togglePlay();
                showControls();
              }}
              onSeek={seekToTime}
              onVolume={setVolume}
              onMute={toggleMute}
              onRate={setRate}
              onCaptions={toggleCaptions}
              onShare={sharePlaying}
              shared={playerShared}
              onFullscreen={() => changeView({ fullscreen: !fullscreen })}
              onPrev={goPrev}
              onNext={goNext}
              hasPrev={!!prevVideo}
              hasNext={!!nextVideo}
              captionSize={captionSize}
              onCaptionSize={changeCaptionSize}
              quality={quality}
              onQuality={changeQuality}
            />
          )}

          {minimized && (
            <>
              {/* 작은 창을 누르면 다시 펼칩니다 */}
              <div
                {...dragHandlers}
                onClick={() => {
                  // 끌었을 때는 펼치지 않습니다.
                  if (dragMovedRef.current) return;
                  changeView({ minimized: false });
                }}
                style={{ position: "absolute", inset: 0, cursor: "pointer", touchAction: "none" }}
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

      {/* 관심 없음 확인 */}
      {muteConfirm && (
        <>
          <div
            onClick={() => setMuteConfirm(null)}
            className="fade-in"
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 80 }}
          />
          <div
            className="rise-in"
            style={{
              position: "fixed",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(340px, calc(100vw - 32px))",
              background: "#141210",
              border: "1px solid #2C271F",
              borderRadius: 14,
              padding: 16,
              zIndex: 81,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ color: "#F2EDE4", fontSize: 14.5, fontWeight: 600, marginBottom: 8 }}>
              {muteConfirm.kind === "channel" ? "이 채널을 추천에서 뺄까요?" : "이 영상을 숨길까요?"}
            </div>
            <div
              style={{
                color: "#B8B2A4",
                fontSize: 12.5,
                lineHeight: 1.5,
                marginBottom: 14,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {muteConfirm.kind === "channel" ? muteConfirm.video.channelTitle : muteConfirm.video.title}
            </div>
            <div style={{ color: "#5C574C", fontSize: 11.5, marginBottom: 14, lineHeight: 1.5 }}>
              {muteConfirm.kind === "channel"
                ? "이 채널 영상이 홈에 더는 나오지 않습니다. 검색으로는 계속 볼 수 있어요."
                : "이 영상이 홈에 더는 나오지 않습니다."}
              <br />
              설정의 "추천 초기화"로 되돌릴 수 있어요.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setMuteConfirm(null)}
                style={{
                  flex: 1,
                  background: "#231F19",
                  border: "none",
                  borderRadius: 8,
                  color: "#B8B2A4",
                  padding: "10px 0",
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={() => applyMute(muteConfirm)}
                style={{
                  flex: 1,
                  background: "#B85C4F",
                  border: "none",
                  borderRadius: 8,
                  color: "#F2EDE4",
                  padding: "10px 0",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {muteConfirm.kind === "channel" ? "추천 안 함" : "숨기기"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 링크 복사 확인 */}
      {shareTarget && (
        <>
          <div
            onClick={() => setShareTarget(null)}
            className="fade-in"
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 80 }}
          />
          <div
            className="rise-in"
            style={{
              position: "fixed",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(360px, calc(100vw - 32px))",
              background: "#141210",
              border: "1px solid #2C271F",
              borderRadius: 14,
              padding: 16,
              zIndex: 81,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ color: "#F2EDE4", fontSize: 14.5, fontWeight: 600, marginBottom: 8 }}>
              링크 복사
            </div>
            <div
              style={{
                color: "#B8B2A4",
                fontSize: 12.5,
                lineHeight: 1.45,
                marginBottom: 6,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {shareTarget.title}
            </div>
            <div
              className="selectable"
              style={{
                color: "#8C8578",
                fontSize: 11.5,
                fontFamily: "'IBM Plex Mono', monospace",
                background: "#0E0D0B",
                border: "1px solid #231F19",
                borderRadius: 8,
                padding: "9px 11px",
                wordBreak: "break-all",
                marginBottom: 14,
              }}
            >
              https://www.youtube.com/watch?v={shareTarget.videoId}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShareTarget(null)}
                style={{
                  flex: 1,
                  background: "#231F19",
                  border: "none",
                  borderRadius: 8,
                  color: "#B8B2A4",
                  padding: "10px 0",
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={() => doCopyLink(shareTarget)}
                style={{
                  flex: 1,
                  background: "#E8A33D",
                  border: "none",
                  borderRadius: 8,
                  color: "#17140F",
                  padding: "10px 0",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                복사
              </button>
            </div>
          </div>
        </>
      )}

      {/* 재생목록에 담기 */}
      {playlistTarget && (
        <>
          <div
            onClick={() => setPlaylistTarget(null)}
            className="fade-in"
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 80 }}
          />
          <div
            className="rise-in"
            style={{
              position: "fixed",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(360px, calc(100vw - 32px))",
              maxHeight: "70vh",
              overflowY: "auto",
              background: "#141210",
              border: "1px solid #2C271F",
              borderRadius: 14,
              padding: 14,
              zIndex: 81,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ color: "#F2EDE4", fontSize: 14.5, fontWeight: 600, marginBottom: 12 }}>
              재생목록에 담기
            </div>

            {playlists.length === 0 && (
              <div style={{ color: "#5C574C", fontSize: 12.5, paddingBottom: 12 }}>
                아직 재생목록이 없어요. 아래에서 만들어보세요.
              </div>
            )}

            {playlists.map((p) => {
              const has = p.videos.some((v) => v.videoId === playlistTarget.videoId);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlaylistVideo(p.id, playlistTarget)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    background: "none",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 8px",
                    color: "#F2EDE4",
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <ListVideo size={15} style={{ color: "#8C8578", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                  </span>
                  <span style={{ color: has ? "#E8A33D" : "#5C574C", fontSize: 12, flexShrink: 0 }}>
                    {has ? "담김" : "담기"}
                  </span>
                </button>
              );
            })}

            <div style={{ display: "flex", gap: 8, marginTop: 12, borderTop: "1px solid #231F19", paddingTop: 12 }}>
              <input
                placeholder="새 재생목록 이름"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  createPlaylist(e.target.value, playlistTarget);
                  e.target.value = "";
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "#0E0D0B",
                  border: "1px solid #2C271F",
                  borderRadius: 8,
                  color: "#F2EDE4",
                  padding: "9px 11px",
                  fontSize: 12.5,
                  outline: "none",
                  fontFamily: "'Inter', sans-serif",
                }}
              />
              <button
                onClick={(e) => {
                  const input = e.currentTarget.previousSibling;
                  createPlaylist(input.value, playlistTarget);
                  input.value = "";
                }}
                style={{
                  background: "#E8A33D",
                  border: "none",
                  borderRadius: 8,
                  color: "#17140F",
                  padding: "0 14px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                만들기
              </button>
            </div>

            <button
              onClick={() => setPlaylistTarget(null)}
              style={{
                width: "100%",
                marginTop: 12,
                background: "#231F19",
                border: "none",
                borderRadius: 8,
                color: "#B8B2A4",
                padding: "10px 0",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              닫기
            </button>
          </div>
        </>
      )}

      {/* 좁은 화면용 아래 탭 바. 사이드바 대신 씁니다. */}
      <div
        className={`bottom-tabs${fullscreen ? " hidden-on-fullscreen" : ""}`}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 75,
          background: "#0E0D0B",
          borderTop: "1px solid #231F19",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {NAV_ITEMS.map(({ icon: Icon, label }) => {
          const active = activeNav === label;
          return (
            <button
              key={label}
              onClick={() => handleNavClick(label)}
              style={{
                flex: 1,
                minWidth: 0,
                background: "none",
                border: "none",
                padding: "9px 2px 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                color: active ? "#E8A33D" : "#8C8578",
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <Icon size={19} />
              <span style={{ fontSize: 10.5, fontWeight: active ? 600 : 400 }}>{label}</span>
            </button>
          );
        })}
      </div>

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

        /* ── 움직임 ──
           버튼·링크·칩은 손을 대면 부드럽게 반응하게 합니다.
           색·투명도만 바꾸는 건 화면을 다시 계산하지 않아 가볍습니다. */
        button, a, input {
          transition: background-color 120ms cubic-bezier(0.22, 0.61, 0.36, 1),
                      color 120ms cubic-bezier(0.22, 0.61, 0.36, 1),
                      border-color 120ms cubic-bezier(0.22, 0.61, 0.36, 1),
                      opacity 120ms cubic-bezier(0.22, 0.61, 0.36, 1),
                      transform 120ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        /* 누르는 순간 살짝 눌리는 느낌 */
        button:active {
          transform: scale(0.96);
        }

        /* 화면에 새로 나타나는 목록·창은 스르륵 떠오르게 */
        @keyframes riseIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .rise-in {
          animation: riseIn 260ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .fade-in {
          animation: fadeIn 200ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }

        /* 움직임을 줄이도록 설정한 기기에서는 애니메이션을 끕니다. */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }

        /* "다음 영상" 목록: 넓은 화면은 오른쪽, 좁은 화면은 댓글 위에 보여줍니다. */
        .related-inline { display: none; }
        @media (max-width: 900px) {
          .related-inline { display: block; margin-top: 26px; }
          .related-side { display: none !important; }
        }

        /* 상단 바는 화면에 붙어 있어서(sticky) 자기 여백을 직접 가져야
           시계·배터리 표시와 겹치지 않습니다. */
        .top-bar {
          padding-top: calc(14px + env(safe-area-inset-top)) !important;
        }

        /* 좁은 화면에서 버튼 글자가 한 글자씩 세로로 서는 걸 막습니다. */
        button {
          white-space: nowrap;
        }
        .action-row button {
          flex-shrink: 0 !important;
          white-space: nowrap !important;
        }
        h1, .selectable, .selectable * {
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        /* 이 두 줄은 반드시 html에만 겁니다. body에도 걸면 스크롤이 죽어요.
           body에 overflow-x: hidden을 주면 브라우저가 세로 방향을 auto로 올려서
           body 자체가 스크롤 상자가 됩니다. 그런데 body 높이는 내용과 같아서
           안에서 굴릴 게 없고, 원래 부모(페이지)로 넘어가야 할 휠·터치 입력을
           overscroll-behavior: none이 막아버립니다. 결국 아무 데도 안 굴러가요.
           (크롬·안드로이드에서만 이렇게 동작하고 사파리는 멀쩡해서 찾기 어렵습니다.)
           html에만 걸면 값이 화면 전체에 그대로 적용돼서 기능은 똑같습니다. */
        html {
          /* 긴 제목·링크가 화면을 옆으로 밀어내지 않게 합니다.
             밀려나면 화면에 고정된 플레이어의 위치도 같이 어긋나요. */
          overflow-x: hidden;
          /* 홈 화면 앱으로 열었을 때 화면 전체를 당겨 늘리지 않게 합니다. */
          overscroll-behavior-y: none;
        }
        html, body {
          max-width: 100%;
        }
        /* 아이폰 노치·홈바를 피해 안전 영역만큼 여백을 둡니다. */
        body {
          padding-bottom: env(safe-area-inset-bottom);
          background: #0E0D0B;
        }

        /* 모바일에서 누를 때 생기는 파란 사각형과 글자 선택을 없앱니다. */
        * {
          -webkit-tap-highlight-color: transparent;
        }
        body, button, div, span, img, svg {
          -webkit-user-select: none;
          user-select: none;
        }
        /* 제목·설명·댓글은 복사할 수 있어야 하니 선택을 허용합니다. */
        h1, p, .selectable, .selectable * {
          -webkit-user-select: text;
          user-select: text;
        }
        button:focus, div:focus, button:focus-visible {
          outline: none;
        }
        img {
          -webkit-touch-callout: none;
        }
        .shorts-scroller { scrollbar-width: none; }
        .shorts-scroller::-webkit-scrollbar { display: none; }
        .mobile-only { display: none !important; }
        .bottom-tabs { display: none; }

        /* 600px 이하(=휴대폰)에서만 모바일 화면으로 바뀝니다.
           태블릿은 세로로 들어도 폭이 720px 정도라 지금 화면을 그대로 씁니다. */
        @media (max-width: 600px) {
          /* 좁은 화면에서는 옆 사이드바 대신 아래 탭 바를 씁니다. */
          .sidebar { display: none !important; }
          .mobile-only { display: none !important; }
          .shorts-arrows { display: none !important; }
          .bottom-tabs { display: flex !important; }

          /* 양옆 여백을 줄여 화면을 넓게 씁니다. */
          .page-pad {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          /* 탭 바에 가리지 않도록 아래쪽을 비워둡니다. */
          .page-pad {
            padding-bottom: calc(76px + env(safe-area-inset-bottom)) !important;
          }
          /* 버튼이 좁아 눌리지 않게, 줄바꿈 대신 옆으로 넘겨 봅니다. */
          .action-row {
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            padding-bottom: 4px;
          }
          .action-row::-webkit-scrollbar { display: none; }

          /* 카드 글씨를 줄여 제목·조회수가 두 줄로 접히지 않게 합니다. */
          .card-title { font-size: 12.5px !important; }
          .card-sub { font-size: 11px !important; }
          .card-meta {
            font-size: 10.5px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          /* 카드가 너무 커 보이지 않게 최소 폭을 줄입니다. */
          .video-grid {
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important;
            gap: 18px 10px !important;
          }
          /* 상단 바를 촘촘하게. 아이폰 상태표시줄에 가리지 않도록 위를 띄웁니다. */
          .top-bar {
            padding: calc(10px + env(safe-area-inset-top)) 12px 10px !important;
            gap: 8px !important;
          }
          /* 좁은 화면에서는 로고 글자를 빼고 심볼만 둡니다. */
          .logo-text { display: none !important; }
          /* 재생 화면 버튼이 한 글자씩 쪼개지지 않게 */
          .player-actions button {
            white-space: nowrap !important;
            flex-shrink: 0 !important;
          }
          /* 숏츠는 탭 바 높이만큼 짧게 잡아야 잘리지 않습니다. */
          .shorts-stage {
            height: calc(100vh - 57px - 76px - env(safe-area-inset-bottom)) !important;
          }

          /* 전체화면 중에는 아래 탭 바를 감춥니다. */
          .bottom-tabs.hidden-on-fullscreen { display: none !important; }

          /* 작은 창은 탭 바 위에 놓습니다. */
          .mini-player {
            bottom: calc(72px + env(safe-area-inset-bottom)) !important;
            right: 12px !important;
          }
        }
        /* PiP 창 안에서는 영상 말고 전부 감춥니다.
           안 그러면 작은 창에 앱 전체가 축소돼 들어가서 아무것도 안 보입니다. */
        .pip-mode .top-bar,
        .pip-mode .sidebar,
        .pip-mode .bottom-tabs,
        .pip-mode .page-pad {
          display: none !important;
        }
        /* 아이폰에서 글자 크기가 16px보다 작은 입력칸을 누르면
           사파리가 화면을 확대해버립니다. user-scalable=no로도 못 막아요.
           손가락으로 쓰는 기기에서만 16px로 올려 확대를 막습니다. */
        @media (pointer: coarse) {
          input, textarea, select {
            font-size: 16px !important;
          }
        }

        /* 아이폰 사파리에서 100vh는 "주소창이 숨겨졌을 때의 높이"입니다.
           그래서 주소창이 보이는 동안에는 화면 밖으로 넘쳐서 아래가 잘립니다.
           dvh는 지금 실제로 보이는 높이라 정확해요.
           지원하지 않는 기기는 아래 @supports를 건너뛰고 기존 vh 값을 그대로 씁니다. */
        @supports (height: 100dvh) {
          .shorts-stage {
            height: calc(100dvh - 57px) !important;
          }
          .player-fs {
            width: 100dvw !important;
            height: 100dvh !important;
          }
          .player-fs-rot {
            width: 100dvh !important;
            height: 100dvw !important;
          }
          @media (max-width: 600px) {
            .shorts-stage {
              height: calc(100dvh - 57px - 76px - env(safe-area-inset-bottom)) !important;
            }
          }
        }

        /* 플레이어는 계속 움직이는 요소라 미리 별도 레이어로 올려둡니다. */
        .player-box { will-change: transform; }
        ::-webkit-scrollbar { height: 6px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: #2C271F; border-radius: 4px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
