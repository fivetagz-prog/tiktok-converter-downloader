const axios = require('axios');

export default async function handler(req, res) {
  const { videoUrl } = req.query;

  if (!videoUrl) {
    return res.status(400).json({ success: false, error: 'Missing video URL parameter.' });
  }

  try {
    const decodedUrl = decodeURIComponent(videoUrl);

    // Request the stream from TikTok with proper anti-blocking headers
    const response = await axios({
      method: 'get',
      url: decodedUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
        'Origin': 'https://www.tiktok.com',
        'Range': 'bytes=0-'
      }
    });

    // Check if TikTok returned an HTML error page (403/CAPTCHA) instead of video bytes
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      return res.status(403).json({ 
        success: false, 
        error: 'TikTok CDN blocked the server IP from streaming this file directly.' 
      });
    }

    // Set binary video headers for true MP4 download
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="tiktok_video.mp4"');

    // Pipe raw video stream back to frontend
    response.data.pipe(res);

  } catch (error) {
    console.error('Download Proxy Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve video stream from TikTok.' 
    });
  }
}
