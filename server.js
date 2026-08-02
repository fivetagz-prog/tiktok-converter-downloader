const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// 1. EXTRACTOR / CONVERT ROUTE
app.post('/api/convert', async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: "Please provide a valid TikTok URL." });
    }

    // Method 1: API Extractor (Highest success rate against datacenter blocks)
    try {
      const apiRes = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({ url, hd: 1 }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        timeout: 8000
      });

      if (apiRes.data && apiRes.data.code === 0 && apiRes.data.data) {
        const d = apiRes.data.data;
        return res.json({
          success: true,
          downloadUrl: sanitizeUrl(d.play || d.wmplay),
          title: d.title || "TikTok Video",
          author: `@${d.author?.unique_id || d.author?.nickname || 'tiktok_user'}`,
          cover: sanitizeUrl(d.cover || d.origin_cover || ''),
          duration: formatDuration(d.duration)
        });
      }
    } catch (apiErr) {
      console.warn('TikWM API failed, attempting direct HTML scrape...');
    }

    // Method 2: Direct HTML Scraping Fallback
    const initialResponse = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/'
      },
      maxRedirects: 5
    });

    const html = initialResponse.data;
    let itemData = null;

    const rehydrationMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (rehydrationMatch) {
      try {
        const parsed = JSON.parse(rehydrationMatch[1]);
        itemData = parsed.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
      } catch (e) {}
    }

    if (!itemData) {
      return res.status(404).json({ success: false, error: "Unable to extract video details. Check URL or privacy settings." });
    }

    const rawPlayUrl = itemData.video?.playAddr || itemData.video?.downloadAddr || '';

    return res.json({
      success: true,
      downloadUrl: sanitizeUrl(rawPlayUrl),
      title: itemData.desc || "TikTok Video",
      author: `@${itemData.author?.uniqueId || 'tiktok_user'}`,
      cover: sanitizeUrl(itemData.video?.cover || ''),
      duration: formatDuration(itemData.video?.duration)
    });

  } catch (error) {
    console.error("TikTok Extractor Error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to process TikTok URL." });
  }
});

// 2. DOWNLOAD STREAM PROXY ROUTE (Pipes stream OR falls back to 302 redirect)
app.get('/api/download', async (req, res) => {
  const { videoUrl } = req.query;

  if (!videoUrl) {
    return res.status(400).json({ success: false, error: 'Missing video URL parameter.' });
  }

  const cleanedUrl = sanitizeUrl(decodeURIComponent(videoUrl));

  try {
    const response = await axios({
      method: 'get',
      url: cleanedUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/'
      },
      timeout: 8000
    });

    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      return res.redirect(302, cleanedUrl);
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="tiktok_video.mp4"');

    response.data.pipe(res);

  } catch (error) {
    console.warn('Proxy Download blocked by CDN, executing 302 browser redirect...');
    return res.redirect(302, cleanedUrl);
  }
});

app.listen(PORT, () => {
  console.log(`TikTok Converter Server listening on port ${PORT}`);
});
