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
  if (!seconds || isNaN(seconds) || seconds <= 0) return "N/A";
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

    // Follow redirect for short links (e.g. vt.tiktok.com)
    const initialResponse = await axios.get(url, {
      headers: HEADERS,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const html = initialResponse.data;
    let itemData = null;

    // Method 1: Extraction from UNIVERSAL_DATA_FOR_REHYDRATION
    const rehydrationMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (rehydrationMatch) {
      try {
        const parsed = JSON.parse(rehydrationMatch[1]);
        const defaultScope = parsed.__DEFAULT_SCOPE__ || {};
        itemData = defaultScope['webapp.video-detail']?.itemInfo?.itemStruct;
      } catch (e) {
        console.warn('Rehydration JSON parse failed');
      }
    }

    // Method 2: Extraction from SIGI_STATE
    if (!itemData) {
      const sigiMatch = html.match(/<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/s);
      if (sigiMatch) {
        try {
          const parsed = JSON.parse(sigiMatch[1]);
          const itemModule = parsed.ItemModule || {};
          const firstKey = Object.keys(itemModule)[0];
          itemData = itemModule[firstKey];
        } catch (e) {
          console.warn('SIGI_STATE JSON parse failed');
        }
      }
    }

    if (!itemData) {
      return res.status(404).json({
        success: false,
        error: 'Unable to extract video details. The video might be private or deleted.'
      });
    }

    // Fallback extraction for MP4 URL
    const playUrl = 
      itemData.video?.playAddr || 
      itemData.video?.downloadAddr || 
      itemData.video?.bitrateInfo?.[0]?.PlayAddr?.UrlList?.[0] || 
      null;

    // Robust duration extraction (Handles seconds vs milliseconds)
    let rawDuration = Number(itemData.video?.duration || 0);
    if (rawDuration > 1000) {
      rawDuration = Math.floor(rawDuration / 1000);
    }

    return res.status(200).json({
      success: true,
      downloadUrl: playUrl,
      title: itemData.desc || 'TikTok Video',
      author: `@${itemData.author?.uniqueId || itemData.author?.nickname || 'tiktok_user'}`,
      cover: itemData.video?.cover || itemData.video?.originCover || itemData.video?.dynamicCover || '',
      duration: formatDuration(rawDuration)
    });

  } catch (error) {
    console.error('TikTok Extractor Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'An error occurred while converting the TikTok video.'
    });
  }
}
