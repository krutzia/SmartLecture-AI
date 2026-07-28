const { YoutubeTranscript } = require("youtube-transcript");

async function fetchYoutubeTranscript(videoId) {
  // Strategy 1: YoutubeTranscript with English preference
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
    if (items && items.length > 0) {
      const text = items.map((i) => i.text.replace(/\[.*?\]/g, "").trim()).filter(Boolean).join(" ");
      if (text.length > 50) return text;
    }
  } catch (e) {
    console.log("Strategy 1 (lang: en) failed:", e.message);
  }

  // Strategy 2: YoutubeTranscript default
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    if (items && items.length > 0) {
      const text = items.map((i) => i.text.replace(/\[.*?\]/g, "").trim()).filter(Boolean).join(" ");
      if (text.length > 50) return text;
    }
  } catch (e) {
    console.log("Strategy 2 (default) failed:", e.message);
  }

  // Strategy 3: Scraping YouTube page directly with Chrome headers
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(watchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (match) {
      const json = JSON.parse(match[1]);
      const tracks = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks && tracks.length > 0) {
        const enTrack = tracks.find((t) => t.languageCode === "en" || t.vssId?.includes(".en")) || tracks[0];
        const capRes = await fetch(enTrack.baseUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        const xml = await capRes.text();
        const matches = [...xml.matchAll(/<text[^>]*>(.*?)<\/text>/gs)];
        if (matches.length > 0) {
          const lines = matches
            .map((m) =>
              m[1]
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/<[^>]+>/g, "")
                .trim(),
            )
            .filter(Boolean);
          const text = lines.join(" ");
          if (text.length > 50) return text;
        }
      }
    }
  } catch (e) {
    console.log("Strategy 3 (direct scraping) failed:", e.message);
  }

  throw new Error("Could not extract transcript from video");
}

fetchYoutubeTranscript("fNk_zzaMoSs")
  .then((text) => console.log("Final Transcript Success! Length:", text.length, "\nSnippet:", text.slice(0, 300)))
  .catch((err) => console.error("Final Error:", err));
