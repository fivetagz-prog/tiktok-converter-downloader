const axios = require('axios');

function sanitizeUrl(url) {
  if (!url) return '';
  return url
    .replace(/\\/g, '')
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&');
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: "Please provide a valid TikTok URL." });
    }

    // TikWM provides direct non-watermarked play stream links
    const apiRes = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({ url, hd: 1 }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      timeout: 10000
    });

    if (apiRes.data && apiRes.data.code === 0 && apiRes.data.data) {
      const d = apiRes.data.data;
      let playLink = d.play || d.wmplay;
      
      if (playLink && !playLink.startsWith('http')) {
        playLink = `https://www.tikwm.com${playLink}`;
      }

      return res.json({
        success: true,
        downloadUrl: sanitizeUrl(playLink),
        title: d.title || "TikTok Video",
        author: `@${d.author?.unique_id || d.author?.nickname || 'tiktok_user'}`,
        cover: sanitizeUrl(d.cover || d.origin_cover || ''),
        duration: formatDuration(d.duration)
      });
    }

    return res.status(400).json({ success: false, error: "Unable to extract video details. Check link." });

  } catch (error) {
    console.error("TikTok Extractor Error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to process TikTok URL." });
  }
}
