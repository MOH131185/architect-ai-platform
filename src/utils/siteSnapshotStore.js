import { set, get, del } from 'idb-keyval';
import runtimeEnv from './runtimeEnv.js';

const STORE_PREFIX = 'archiAI_siteSnapshot';

function dataUrlToBlob(dataUrl) {
  const matches = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!matches) {
    throw new Error('Invalid data URL format');
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const byteCharacters = atob(base64Data);
  const byteArrays = [];

  const sliceSize = 1024;
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i += 1) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: mimeType });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function saveSiteSnapshot(designId, dataUrl) {
  if (!runtimeEnv.isBrowser || !designId || !dataUrl) {
    return null;
  }

  const key = `${STORE_PREFIX}:${designId}`;
  try {
    const blob = dataUrl.startsWith('data:')
      ? dataUrlToBlob(dataUrl)
      : await fetch(dataUrl).then(resp => resp.blob());
    await set(key, blob);
    return key;
  } catch (error) {
    console.error('Failed to persist site snapshot', error);
    return null;
  }
}

export async function loadSiteSnapshotByKey(key) {
  if (!runtimeEnv.isBrowser || !key) {
    return null;
  }

  try {
    const blob = await get(key);
    if (!blob) {
      return null;
    }
    return blobToDataUrl(blob);
  } catch (error) {
    console.error('Failed to load site snapshot', error);
    return null;
  }
}

export async function deleteSiteSnapshot(key) {
  if (!runtimeEnv.isBrowser || !key) {
    return;
  }

  try {
    await del(key);
  } catch (error) {
    console.error('Failed to delete site snapshot', error);
  }
}

