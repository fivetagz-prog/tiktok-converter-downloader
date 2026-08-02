const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none'
};

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type, Date'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'Please provide a valid TikTok URL.' });
    }

    const initialResponse = await axios.get(url, {
      headers: HEADERS,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const html = initialResponse.data;
    let itemData = null;

    const rehydrationMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (rehydrationMatch) {
      try {
        const parsed = JSON.parse(rehydrationMatch[1]);
        const defaultScope = parsed.__DEFAULT_SCOPE__ || {};
        itemData = defaultScope['webapp.video-detail']?.itemInfo?.itemStruct;
      } catch (e) {
        console.warn('Rehydration parse failed');
      }
    }

    if (!itemData) {
      const sigiMatch = html.match(/<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/s);
      if (sigiMatch) {
        try {
          const parsed = JSON.parse(sigiMatch[1]);
          const itemModule = parsed.ItemModule || {};
          const firstKey = Object.keys(itemModule)[0];
          itemData = itemModule[firstKey];
        } catch (e) {
          console.warn('SIGI_STATE parse failed');
        }
      }
    }

    if (!itemData) {
      return res.status(404).json({
        success: false,
        error: 'Unable to extract video details. The video might be private or deleted.'
      });
    }

    const playUrl = itemData.video?.playAddr || itemData.video?.downloadAddr;

    return res.status(200).json({
      success: true,
      downloadUrl: playUrl || null,
      title: itemData.desc || 'TikTok Video',
      author: `@${itemData.author?.uniqueId || itemData.author?.nickname || 'tiktok_user'}`,
      cover: itemData.video?.cover || itemData.video?.originCover || itemData.video?.dynamicCover,
      duration: formatDuration(itemData.video?.duration)
    });

  } catch (error) {
    console.error('TikTok Extractor Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'An error occurred while converting the TikTok video.'
    });
  }
}
