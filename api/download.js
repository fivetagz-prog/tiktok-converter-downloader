const axios = require('axios');

function sanitizeUrl(url) {
  if (!url) return '';
  return url
    .replace(/\\/g, '')
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&');
}

export default async function handler(req, res) {
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
        'Referer': 'https://www.tiktok.com/',
        'Range': 'bytes=0-'
      },
      timeout: 15000
    });

    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      return res.status(403).json({ success: false, error: 'TikTok CDN blocked stream request.' });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="tiktok_video.mp4"');

    response.data.pipe(res);

  } catch (error) {
    console.error('Vercel Proxy Download Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve stream from TikTok CDN.' });
  }
}
