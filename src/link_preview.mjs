const PRIVATE_HOST_RE = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|\[?::1\]?)/i;
const IMAGE_RE = /\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i;

export function normalizePreviewURL(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    if (PRIVATE_HOST_RE.test(url.hostname)) {
      return "";
    }
    if (url.hostname === "share.myfreecams.com" && url.pathname.startsWith("/embed/a/")) {
      url.pathname = url.pathname.replace("/embed/a/", "/a/");
    }
    return url.toString();
  } catch {
    return "";
  }
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function cleanText(value, maxLength = 180) {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function attr(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return decodeEntities(match?.[1] || match?.[2] || match?.[3] || "");
}

function metaContent(html, names) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const property = attr(tag, "property").toLowerCase();
    const name = attr(tag, "name").toLowerCase();
    if (names.includes(property) || names.includes(name)) {
      const content = cleanText(attr(tag, "content"), 300);
      if (content) return content;
    }
  }
  return "";
}

function absoluteURL(value, pageURL) {
  if (!value || value.startsWith("data:")) {
    return "";
  }

  try {
    const url = new URL(decodeEntities(value), pageURL);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function firstUsefulImage(html, pageURL) {
  const tags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const source = attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-original");
    const imageURL = absoluteURL(source, pageURL);
    if (imageURL && !imageURL.includes("/favicons/")) {
      return imageURL;
    }
  }
  return "";
}

function mfcShareCaption(html) {
  const model = cleanText(html.match(/<a\b[^>]*class=["'][^"']*\bavatar\b[^"']*["'][^>]*>[\s\S]*?<\/a>/i)?.[0], 60);
  const duration = cleanText(html.match(/<i class=["']icon-(?:videocam|image)[^>]*><\/i>\s*([^<]+)/i)?.[1], 40);
  const parts = [];
  if (model) parts.push(`by ${model}`);
  if (duration) parts.push(duration);
  return parts.length ? `MFC Share album ${parts.join(" - ")}` : "";
}

export function extractLinkPreview(html, pageURL) {
  const title = metaContent(html, ["og:title", "twitter:title"]) ||
    cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 120) ||
    cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1], 120) ||
    cleanText(html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1], 120);

  const description = metaContent(html, ["og:description", "twitter:description", "description"]) ||
    mfcShareCaption(html);

  const imageURL = absoluteURL(metaContent(html, ["og:image", "twitter:image"]), pageURL) ||
    firstUsefulImage(html, pageURL);

  return {
    title,
    caption: description,
    image_url: IMAGE_RE.test(imageURL) || imageURL.includes("mfcimg.com") ? imageURL : "",
    url: pageURL,
  };
}

export async function fetchLinkPreview(rawURL, { fetchImpl = fetch, timeoutMS = 5000 } = {}) {
  const pageURL = normalizePreviewURL(rawURL);
  if (!pageURL) {
    const error = new Error("Invalid preview URL");
    error.statusCode = 400;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMS);
  try {
    const response = await fetchImpl(pageURL, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "MFC-Overlay-Relay/0.1 link-preview",
      },
    });
    if (!response.ok) {
      const error = new Error(`Preview URL returned HTTP ${response.status}`);
      error.statusCode = 502;
      throw error;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) {
      const error = new Error("Preview URL is not an HTML page");
      error.statusCode = 415;
      throw error;
    }
    const html = await response.text();
    return extractLinkPreview(html.slice(0, 512 * 1024), response.url || pageURL);
  } finally {
    clearTimeout(timeout);
  }
}
