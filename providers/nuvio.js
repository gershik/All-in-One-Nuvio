const PROVIDER_NAME = "DesiFlix";
const DESIFLIX_BASE = "https://manifest.desitvhub.eu.org";
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const FETCH_TIMEOUT = 12000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function log(message) {
  console.log(`[${PROVIDER_NAME}] ${message}`);
}

function err(message) {
  console.error(`[${PROVIDER_NAME}] ${message}`);
}

function raceTimeout(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms);
  });
}

async function fetchJson(url) {
  try {
    const request = fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json"
      }
    });

    const response = await Promise.race([
      request,
      raceTimeout(FETCH_TIMEOUT)
    ]);

    if (response && response.ok) {
      return await response.json();
    }
  } catch (error) {
    err(`fetch failed: ${url} -> ${error.message || ""}`);
  }

  return null;
}

async function getTMDBDetails(tmdbId, mediaType) {
  const isSeries = mediaType === "tv" || mediaType === "series";
  const tmdbType = isSeries ? "tv" : "movie";

  const url =
    `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}` +
    `?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

  const data = await fetchJson(url);

  if (!data) {
    return {
      title: "DesiFlix Title",
      year: "",
      imdbId: null
    };
  }

  return {
    title: (isSeries ? data.name : data.title) || "DesiFlix Title",
    year: (
      isSeries
        ? data.first_air_date || ""
        : data.release_date || ""
    ).split("-")[0],
    imdbId:
      data.imdb_id ||
      (data.external_ids && data.external_ids.imdb_id) ||
      null
  };
}

const INDIAN_AUDIO_LANGUAGES = [
  ["Hindi", /\b(?:hindi|hin)\b/i],
  ["Telugu", /\b(?:telugu|tel)\b/i],
  ["Tamil", /\b(?:tamil|tam)\b/i],
  ["Malayalam", /\b(?:malayalam|mal)\b/i],
  ["Kannada", /\b(?:kannada|kan)\b/i],
  ["Bengali", /\b(?:bengali|bangla|ben)\b/i],
  ["Marathi", /\b(?:marathi|mar)\b/i],
  ["Gujarati", /\b(?:gujarati|guj)\b/i],
  ["Punjabi", /\b(?:punjabi|pan)\b/i],
  ["Odia", /\b(?:odia|oriya|ori)\b/i],
  ["Urdu", /\b(?:urdu|urd)\b/i],
  ["Assamese", /\b(?:assamese|asm)\b/i],
  ["Bhojpuri", /\bbhojpuri\b/i],
  ["Konkani", /\bkonkani\b/i]
];

function detectIndianAudioLanguages(text) {
  const value = String(text || "");

  return INDIAN_AUDIO_LANGUAGES
    .filter(([, pattern]) => pattern.test(value))
    .map(([name]) => name);
}

function hasEnglishAudio(text) {
  return /\b(?:english|eng)\b/i.test(String(text || ""));
}

function isIndianLanguageOnly(text) {
  const value = String(text || "");
  const indianLanguages = detectIndianAudioLanguages(value);

  if (indianLanguages.length === 0) {
    return false;
  }

  // Keep anything that explicitly includes English.
  // Examples: "Hindi + English", "Eng-Hin", "English Telugu".
  if (hasEnglishAudio(value)) {
    return false;
  }

  // A bare "dual audio" / "multi audio" label is ambiguous and often
  // includes English, so do not remove it unless the text explicitly
  // identifies only Indian languages.
  const hasAmbiguousMultiAudio =
    /\bdual(?:[-\s]?audio)?\b/i.test(value) ||
    /\bmulti(?:[-\s]?audio)?\b/i.test(value);

  if (hasAmbiguousMultiAudio && indianLanguages.length === 1) {
    return false;
  }

  return true;
}

function parseLanguage(text) {
  const value = String(text || "").toLowerCase();
  const indianLanguages = detectIndianAudioLanguages(value);
  const hasEnglish = hasEnglishAudio(value);

  if (value.includes("multi")) {
    if (hasEnglish && indianLanguages.length > 0) {
      return "Multi-Audio";
    }

    if (indianLanguages.length > 1) {
      return "Multi-Audio";
    }

    return "Multi-Audio";
  }

  if (
    (hasEnglish && indianLanguages.length > 0) ||
    value.includes("dual")
  ) {
    return "Dual-Audio";
  }

  if (hasEnglish) {
    return "English";
  }

  if (indianLanguages.length > 0) {
    return indianLanguages.join(" + ");
  }

  return "Original";
}

function buildDropdownMetadata(
  details,
  quality,
  isSeries,
  season,
  episode,
  stream
) {
  const title = details.title || "DesiFlix Title";
  const year = details.year ? ` (${details.year})` : "";

  const rawText =
    `${stream.title || ""} ${stream.name || ""} ${stream.url || ""}`;
  const lower = rawText.toLowerCase();

  let line1 = `🍿 ${title}${year}`;

  if (isSeries && season != null && episode != null) {
    line1 +=
      ` | S${String(season).padStart(2, "0")}` +
      `E${String(episode).padStart(2, "0")}`;
  }

  let qualityIcon = "💎";

  if (quality.includes("2160") || quality.includes("4k")) {
    qualityIcon = "🌟";
  } else if (quality.includes("1080")) {
    qualityIcon = "🔥";
  }

  const language = parseLanguage(lower);

  const sizeMatch = lower.match(/(\d+(?:\.\d+)?\s*(?:gb|mb))/i);
  const size = sizeMatch
    ? sizeMatch[1].toUpperCase()
    : "Variable Size";

  const line2 =
    `${qualityIcon} ${quality} | 💾 ${size} | 🔊 ${language}`;

  let codec = "x264";

  if (
    lower.includes("hevc") &&
    (lower.includes("x265") || lower.includes("h265"))
  ) {
    codec = "HEVC x265";
  } else if (lower.includes("hevc")) {
    codec = "HEVC x264";
  } else if (
    lower.includes("x265") ||
    lower.includes("h265")
  ) {
    codec = "x265";
  }

  let audio = "AAC";

  if (
    lower.includes("ddp5.1") ||
    lower.includes("ddp 5.1")
  ) {
    audio = "DDP5.1";
  } else if (
    lower.includes("dd5.1") ||
    lower.includes("5.1")
  ) {
    audio = "DD5.1";
  } else if (lower.includes("7.1")) {
    audio = "7.1";
  } else if (lower.includes("truehd")) {
    audio = "TrueHD";
  }

  const atmos = lower.includes("atmos")
    ? " | 🔊 Atmos"
    : "";

  const line3 = `🎥 ${codec} | 🎧 ${audio}${atmos}`;

  let source = "📥 WEB-DL";

  if (
    lower.includes("web-rip") ||
    lower.includes("webrip")
  ) {
    source = "🌐 WEB-RIP";
  } else if (lower.includes("bluray")) {
    source = "💿 BluRay";
  } else if (lower.includes("hdrip")) {
    source = "📺 HD-RIP";
  }

  const container =
    stream.url && stream.url.includes(".mp4")
      ? "MP4"
      : "MKV";

  let dynamicRange = "SDR";

  if (
    lower.includes("10bit") ||
    lower.includes("10-bit")
  ) {
    dynamicRange = lower.includes("hdr")
      ? "10bit HDR"
      : "10bit";
  } else if (lower.includes("hdr10+")) {
    dynamicRange = "HDR10+";
  } else if (lower.includes("hdr")) {
    dynamicRange = "HDR";
  } else if (
    lower.includes("dv") ||
    lower.includes("dolby vision")
  ) {
    dynamicRange = "Dolby Vision";
  }

  const line4 =
    `${source} | 📦 ${container} | 🌈 ${dynamicRange}`;

  const line5 = `📎 ${PROVIDER_NAME}`;

  return [
    line1,
    line2,
    line3,
    line4,
    line5
  ].join("\n");
}

function getQuality(rawText) {
  const value = String(rawText || "").toLowerCase();

  if (
    value.includes("2160") ||
    value.includes("4k")
  ) {
    return "2160p";
  }

  if (value.includes("720")) {
    return "720p";
  }

  if (value.includes("480")) {
    return "480p";
  }

  return "1080p";
}

function qualityWeight(name) {
  const value = String(name || "").toLowerCase();

  if (
    value.includes("2160p") ||
    value.includes("4k")
  ) {
    return 2160;
  }

  if (value.includes("1080p")) {
    return 1080;
  }

  if (value.includes("720p")) {
    return 720;
  }

  if (value.includes("480p")) {
    return 480;
  }

  return 0;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  const isSeries =
    mediaType === "tv" ||
    mediaType === "series";

  log(
    `Request: tmdbId=${tmdbId}` +
    ` type=${mediaType}` +
    ` s=${season}` +
    ` e=${episode}`
  );

  const details = await getTMDBDetails(
    tmdbId,
    mediaType
  );

  const lookupId =
    details.imdbId || tmdbId;

  let endpoint;

  if (isSeries) {
    const resolvedSeason =
      season != null ? season : 1;
    const resolvedEpisode =
      episode != null ? episode : 1;

    endpoint =
      `${DESIFLIX_BASE}/stream/series/` +
      `${lookupId}:${resolvedSeason}:${resolvedEpisode}.json`;
  } else {
    endpoint =
      `${DESIFLIX_BASE}/stream/movie/${lookupId}.json`;
  }

  log(`Fetching streams from: ${endpoint}`);

  let response = await fetchJson(endpoint);

  // The provider normally uses IMDb IDs when TMDB supplies one.
  // If that returns nothing, retry the original TMDB ID endpoint.
  if (
    (
      !response ||
      !response.streams ||
      !response.streams.length
    ) &&
    details.imdbId
  ) {
    const fallbackEndpoint = isSeries
      ? (
          `${DESIFLIX_BASE}/stream/series/` +
          `${tmdbId}:${season || 1}:${episode || 1}.json`
        )
      : `${DESIFLIX_BASE}/stream/movie/${tmdbId}.json`;

    log(
      `Retrying with fallback endpoint: ${fallbackEndpoint}`
    );

    response = await fetchJson(fallbackEndpoint);
  }

  if (
    !response ||
    !response.streams ||
    !response.streams.length
  ) {
    log("No streams returned from DesiFlix");
    return [];
  }

  const results = [];
  const seenUrls = new Set();

  for (const stream of response.streams) {
    const url =
      stream.url ||
      stream.externalUrl;

    if (!url || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);

    const rawText =
      `${stream.title || ""} ` +
      `${stream.name || ""} ` +
      `${url}`;

    // Remove streams explicitly identified as Indian-language-only.
    // English + Hindi/Telugu/etc. is deliberately kept.
    if (isIndianLanguageOnly(rawText)) {
      continue;
    }

    const lower = rawText.toLowerCase();
    const quality = getQuality(lower);
    const language = parseLanguage(lower);

    const metadata = buildDropdownMetadata(
      details,
      quality,
      isSeries,
      season,
      episode,
      stream
    );

    results.push({
      name:
        `${PROVIDER_NAME} | ${quality} | ${language}`,
      title: metadata,
      size: metadata,
      description: metadata,
      url,
      quality: "",
      language: "",
      headers: {
        "User-Agent": USER_AGENT,
        Referer: `${DESIFLIX_BASE}/`
      }
    });
  }

  results.sort(
    (a, b) =>
      qualityWeight(b.name) -
      qualityWeight(a.name)
  );

  log(`Returning ${results.length} sorted streams`);

  return results;
}

if (
  typeof module !== "undefined" &&
  module.exports
) {
  module.exports = {
    getStreams
  };
} else {
  global.getStreams = getStreams;
}