"use strict";
(() => {
  // extension/content.ts
  var targetVideo = null;
  var sampleCanvas = null;
  var rafId = null;
  var iframeEl = null;
  var popupEl = null;
  var currentThreatLevel = "trusted";
  var popupTimeout = null;
  function showMassivePopup(level) {
    if (level === currentThreatLevel && popupEl && popupEl.style.display !== "none") return;
    currentThreatLevel = level;
    if (!popupEl) {
      popupEl = document.createElement("div");
      popupEl.style.position = "fixed";
      popupEl.style.top = "24px";
      popupEl.style.left = "50%";
      popupEl.style.transform = "translateX(-50%)";
      popupEl.style.padding = "12px 24px";
      popupEl.style.borderRadius = "8px";
      popupEl.style.zIndex = "9999999";
      popupEl.style.background = "rgba(0, 0, 0, 0.9)";
      popupEl.style.fontFamily = "monospace";
      popupEl.style.fontSize = "16px";
      popupEl.style.fontWeight = "bold";
      popupEl.style.textAlign = "center";
      popupEl.style.boxShadow = "0 10px 25px rgba(0,0,0,0.5)";
      popupEl.style.textTransform = "uppercase";
      popupEl.style.pointerEvents = "none";
      popupEl.style.transition = "all 0.3s ease";
      popupEl.style.border = "1px solid #333";
      document.body.appendChild(popupEl);
    }
    popupEl.style.display = "block";
    clearTimeout(popupTimeout);
    if (level === "deepfake") {
      popupEl.style.color = "#ef4444";
      popupEl.style.borderColor = "#ef4444";
      popupEl.innerText = "\u{1F6A8} DEEPFAKE DETECTED";
    } else if (level === "suspicious") {
      popupEl.style.color = "#fbbf24";
      popupEl.style.borderColor = "#fbbf24";
      popupEl.innerText = "\u26A0\uFE0F SUSPICIOUS ACTIVITY";
      popupTimeout = setTimeout(() => {
        popupEl.style.display = "none";
      }, 4e3);
    } else {
      popupEl.style.color = "#4ade80";
      popupEl.style.borderColor = "#4ade80";
      popupEl.innerText = "\u2705 SECURE CONNECTION";
      popupTimeout = setTimeout(() => {
        popupEl.style.display = "none";
      }, 3e3);
    }
  }
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "THREAT_LEVEL") {
      showMassivePopup(e.data.level);
    }
  });
  function injectIframe() {
    if (iframeEl) return;
    iframeEl = document.createElement("iframe");
    iframeEl.src = chrome.runtime.getURL("iframe.html");
    iframeEl.style.position = "fixed";
    iframeEl.style.top = "20px";
    iframeEl.style.right = "20px";
    iframeEl.style.zIndex = "999999";
    iframeEl.style.width = "300px";
    iframeEl.style.height = "450px";
    iframeEl.style.border = "none";
    iframeEl.style.background = "transparent";
    iframeEl.style.pointerEvents = "auto";
    iframeEl.allow = "camera; microphone";
    document.body.appendChild(iframeEl);
  }
  function findTargetVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    let best = null;
    let maxArea = 0;
    for (const v of videos) {
      if (v.readyState < 2) continue;
      const rect = v.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea && area > 1e4) {
        maxArea = area;
        best = v;
      }
    }
    return best;
  }
  function analyzeFrame() {
    rafId = requestAnimationFrame(analyzeFrame);
    if (!iframeEl || !iframeEl.contentWindow) return;
    if (!targetVideo || targetVideo.readyState < 2 || targetVideo.paused) {
      targetVideo = findTargetVideo();
      if (!targetVideo) return;
    }
    const aspect = targetVideo.videoWidth / targetVideo.videoHeight;
    const w = Math.min(320, targetVideo.videoWidth);
    const h = Math.floor(w / aspect);
    if (!w || !h) return;
    if (!sampleCanvas) sampleCanvas = document.createElement("canvas");
    if (sampleCanvas.width !== w) sampleCanvas.width = w;
    if (sampleCanvas.height !== h) sampleCanvas.height = h;
    const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(targetVideo, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const now = performance.now();
    iframeEl.contentWindow.postMessage(
      {
        type: "FRAME",
        imageData: imageData.data.buffer,
        width: w,
        height: h,
        timestamp: now
      },
      "*",
      [imageData.data.buffer]
    );
  }
  async function start() {
    console.log("[MirrorBreaker] Starting Advanced Extension Content Script");
    injectIframe();
    if (rafId) cancelAnimationFrame(rafId);
    analyzeFrame();
  }
  setTimeout(start, 3e3);
})();
