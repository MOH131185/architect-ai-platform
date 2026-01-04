import sharp from 'sharp';

const DEFAULT_INSET = {
  x: 0.025,
  y: 0.04,
  width: 0.34,
  height: 0.16,
  paddingRatio: 0.02,
  labelHeightRatio: 0.05
};

const svgBuffer = (svg) => Buffer.from(svg);

async function sourceToBuffer(source) {
  if (!source) {
    throw new Error('Source is required');
  }

  if (source.startsWith('data:')) {
    const base64 = source.split(',')[1];
    return Buffer.from(base64, 'base64');
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function normalizeInset(inset = {}) {
  return {
    x: inset.x ?? DEFAULT_INSET.x,
    y: inset.y ?? DEFAULT_INSET.y,
    width: inset.width ?? DEFAULT_INSET.width,
    height: inset.height ?? DEFAULT_INSET.height,
    paddingRatio: inset.paddingRatio ?? DEFAULT_INSET.paddingRatio,
    labelHeightRatio: inset.labelHeightRatio ?? DEFAULT_INSET.labelHeightRatio
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const {
      baseImageUrl,
      siteMapDataUrl,
      inset: insetInput,
      label = 'SITE PLAN — REAL CONTEXT OVERLAY (Scale 1:1250)'
    } = req.body || {};

    if (!baseImageUrl || !siteMapDataUrl) {
      return res.status(400).json({ error: 'baseImageUrl and siteMapDataUrl are required' });
    }

    const baseBuffer = await sourceToBuffer(baseImageUrl);
    const siteMapBuffer = await sourceToBuffer(siteMapDataUrl);

    const baseImage = sharp(baseBuffer);
    const baseMetadata = await baseImage.metadata();
    const inset = normalizeInset(insetInput);

    if (!baseMetadata.width || !baseMetadata.height) {
      throw new Error('Unable to determine base image dimensions');
    }

    const panelWidth = Math.round(baseMetadata.width * inset.width);
    const panelHeight = Math.round(baseMetadata.height * inset.height);
    const panelX = Math.round(baseMetadata.width * inset.x);
    const panelY = Math.round(baseMetadata.height * inset.y);
    const padding = Math.max(4, Math.round(panelWidth * inset.paddingRatio));
    const labelHeight = Math.max(20, Math.round(panelHeight * inset.labelHeightRatio));
    const mapWidth = Math.max(8, panelWidth - padding * 2);
    const mapHeight = Math.max(8, panelHeight - padding - labelHeight - padding);

    const background = await sharp({
      create: {
        width: panelWidth,
        height: panelHeight,
        channels: 4,
        background: '#ffffff'
      }
    })
      .png()
      .toBuffer();

    const resizedSiteMap = await sharp(siteMapBuffer)
      .resize(mapWidth, mapHeight, { fit: 'cover' })
      .png()
      .toBuffer();

    let panelImage = await sharp(background)
      .composite([
        {
          input: resizedSiteMap,
          top: labelHeight,
          left: padding
        }
      ])
      .png()
      .toBuffer();

    const labelSvg = svgBuffer(
      `<svg width="${panelWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${panelWidth}" height="${labelHeight}" fill="#f6f6f6"/>
        <text x="${padding}" y="${labelHeight / 2 + 4}" font-family="Arial" font-size="${Math.max(
          18,
          Math.round(panelWidth * 0.02)
        )}" font-weight="bold" fill="#333">${label}</text>
      </svg>`
    );

    panelImage = await sharp(panelImage)
      .composite([
        { input: labelSvg, top: 0, left: 0 }
      ])
      .png()
      .toBuffer();

    const borderSvg = svgBuffer(
      `<svg width="${panelWidth}" height="${panelHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${panelWidth - 1}" height="${panelHeight - 1}" fill="none" stroke="#333333" stroke-width="3"/>
      </svg>`
    );

    panelImage = await sharp(panelImage)
      .composite([{ input: borderSvg, top: 0, left: 0 }])
      .png()
      .toBuffer();

    const finalBuffer = await baseImage
      .composite([
        {
          input: panelImage,
          top: panelY,
          left: panelX
        }
      ])
      .png()
      .toBuffer();

    const dataUrl = `data:image/png;base64,${finalBuffer.toString('base64')}`;

    return res.status(200).json({
      url: dataUrl,
      metadata: {
        width: baseMetadata.width,
        height: baseMetadata.height,
        format: 'png',
        inset: {
          x: panelX,
          y: panelY,
          width: panelWidth,
          height: panelHeight
        }
      }
    });
  } catch (error) {
    console.error('❌ Overlay site map error:', error);
    return res.status(500).json({ error: error.message });
  }
}

