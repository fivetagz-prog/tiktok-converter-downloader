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

// 1. EXTRACTOR ROUTE
app.post('/api/convert', async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: "Please provide a valid TikTok URL." });
    }

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
});

// 2. BINARY DOWNLOAD PROXY ROUTE
app.get('/api/download', async (req, res) => {
  const { videoUrl } = req.query;

  if (!videoUrl) {
    return res.status(400).json({ success: false, error: 'Missing video URL parameter.' });
  }

  const cleanedUrl = sanitizeUrl(decodeURIComponent(videoUrl));

  try {
    const response = await axios.get(cleanedUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.tikwm.com/'
      },
      timeout: 25000
    });

    const buffer = Buffer.from(response.data);

    // Verify binary data (Ensure TikTok CDN didn't return HTML/JSON error text)
    const headerText = buffer.toString('utf8', 0, 100);
    if (headerText.includes('<html') || headerText.includes('<!DOCTYPE') || headerText.includes('{"code"')) {
      return res.status(403).json({ success: false, error: 'TikTok CDN blocked the video stream.' });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="tiktok_${Date.now()}.mp4"`);

    return res.send(buffer);

  } catch (error) {
    console.error('Buffer Download Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve complete video binary from server.' });
  }
});

app.listen(PORT, () => {
  console.log(`TikTok Converter Server running on port ${PORT}`);
});
