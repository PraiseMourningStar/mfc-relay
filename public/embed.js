(function () {
  const script = document.currentScript;
  const src = new URL(script.src);
  const channel = src.searchParams.get("channel") || script.dataset.channel;
  const template = src.searchParams.get("template") || script.dataset.template || "";
  const showPaused = src.searchParams.get("show_paused") || script.dataset.showPaused || "";
  const width = script.dataset.width || "100%";
  const height = script.dataset.height || "180";

  if (!channel) {
    return;
  }

  const params = new URLSearchParams();
  if (template) params.set("template", template);
  if (showPaused) params.set("show_paused", showPaused);

  const iframe = document.createElement("iframe");
  iframe.src = `${src.origin}/overlay/${encodeURIComponent(channel)}${params.toString() ? `?${params}` : ""}`;
  iframe.title = "MFC now playing";
  iframe.loading = "lazy";
  iframe.allowTransparency = "true";
  iframe.style.width = width;
  iframe.style.height = `${Number(height) || 180}px`;
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.style.background = "transparent";

  script.insertAdjacentElement("afterend", iframe);
})();
