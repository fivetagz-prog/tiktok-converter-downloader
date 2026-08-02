const axios = require('axios');

export default async function handler(req, res) {
  const { videoUrl } = req.query;

  if (!videoUrl) {
    return res.status(400).send('Missing video URL parameter.');
  }

  try {
    const response = await axios({
      method: 'get',
      url: decodeURIComponent(videoUrl),
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/'
      }
    });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="tiktok_video.mp4"');

    response.data.pipe(res);
  } catch (error) {
    console.error('Proxy Download Error:', error.message);
    res.status(500).send('Failed to retrieve video stream.');
  }
}
