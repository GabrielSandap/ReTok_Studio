import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  CircleStop,
  Crosshair,
  FlipHorizontal,
  Library,
  Download,
  Mic2,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  Video,
} from 'lucide-react';

const DB_NAME = 'retok-studio-library';
const DB_VERSION = 1;
const STORE_NAME = 'takes';
const TIKTOK_WIDTH = 1080;
const TIKTOK_HEIGHT = 1920;
const CAMERA_ASPECT_RATIO = 16 / 9;
const DISPOSABLE_NOISE_POINTS = 2200;
const DEFAULT_WHITE_BALANCE_KELVIN = 5200;
const DEFAULT_WHITE_BALANCE_TINT = 0;
const SKIN_SMOOTHING_SCALE = 0.22;
const SKIN_SMOOTHING_ALPHA = 0.38;
const HALATION_SCALE = 0.18;
const HALATION_ALPHA = 0.48;
const RETRO_GLOW_SCALE = 0.16;
const RETRO_GLOW_ALPHA = 0.2;
const WIDE_CAMERA_STORAGE_KEY = 'retok-wide-camera-id';
const WIDE_CAMERA_MANUAL_KEY = 'retok-wide-camera-manual';

const CAMERA_TEST_MODES = [
  {
    key: 'natural',
    label: 'auto',
    constraints: {
      aspectRatio: { ideal: CAMERA_ASPECT_RATIO },
      resizeMode: { ideal: 'none' },
      frameRate: { ideal: 30, max: 60 },
    },
    forceResolution: false,
  },
  {
    key: 'hd',
    label: '720p wide',
    constraints: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      aspectRatio: { ideal: CAMERA_ASPECT_RATIO },
      resizeMode: { ideal: 'none' },
      frameRate: { ideal: 30, max: 60 },
    },
    forceResolution: false,
  },
  {
    key: 'fullhd',
    label: '1080p',
    constraints: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      aspectRatio: { ideal: CAMERA_ASPECT_RATIO },
      resizeMode: { ideal: 'none' },
      frameRate: { ideal: 30, max: 60 },
    },
    forceResolution: true,
  },
];

let skinSmoothingBuffers;
let halationBuffers;
let retroGlowBuffers;

const RECORDER_FORMATS = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4', label: 'MP4' },
  { mimeType: 'video/mp4;codecs=h264,aac', extension: 'mp4', label: 'MP4' },
  { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm', label: 'WebM' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm', label: 'WebM' },
  { mimeType: 'video/webm;codecs=h264,opus', extension: 'webm', label: 'WebM' },
  { mimeType: 'video/webm', extension: 'webm', label: 'WebM' },
];

function deviceName(devices, deviceId, fallback) {
  const index = devices.findIndex((device) => device.deviceId === deviceId);
  const device = devices[index];
  if (!device) return fallback;
  return device.label || `${fallback} ${index + 1}`;
}

function makeAudioConstraints(deviceId) {
  return {
    video: false,
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
    },
  };
}

function getCameraTestMode(modeKey = 'natural') {
  return CAMERA_TEST_MODES.find((mode) => mode.key === modeKey) || CAMERA_TEST_MODES[0];
}

function makeCameraConstraints(deviceId, modeKey = 'natural') {
  const mode = getCameraTestMode(modeKey);

  return {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    ...mode.constraints,
  };
}

function getCapabilityMin(capability) {
  if (!capability || typeof capability !== 'object') return null;
  return Number.isFinite(capability.min) ? capability.min : null;
}

async function getWideCameraStream(deviceId, modeKey = 'natural') {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: makeCameraConstraints(deviceId, modeKey),
      audio: false,
    });
  } catch (wideError) {
    return navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        ...getCameraTestMode(modeKey).constraints,
        aspectRatio: { ideal: CAMERA_ASPECT_RATIO },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    });
  }
}

function readStoredWideCameraSelection() {
  if (typeof localStorage === 'undefined') return { deviceId: '', manual: false };

  return {
    deviceId: localStorage.getItem(WIDE_CAMERA_STORAGE_KEY) || '',
    manual: localStorage.getItem(WIDE_CAMERA_MANUAL_KEY) === 'true',
  };
}

function saveWideCameraSelection(deviceId, manual) {
  if (typeof localStorage === 'undefined' || !deviceId) return;
  localStorage.setItem(WIDE_CAMERA_STORAGE_KEY, deviceId);
  localStorage.setItem(WIDE_CAMERA_MANUAL_KEY, String(manual));
}

function getWideLabelScore(label) {
  const normalizedLabel = label.toLowerCase();
  let score = 0;

  if (/iphone|continuity|perso/.test(normalizedLabel)) score += 55;
  if (/obs|virtual/.test(normalizedLabel)) score += 38;
  if (/wide|ultra|grand angle|large/.test(normalizedLabel)) score += 34;
  if (/facetime/.test(normalizedLabel)) score -= 10;

  return score;
}

function scoreCameraProfile(label, settings, capabilities, modeKey = 'natural') {
  const width = Number(settings?.width) || 0;
  const height = Number(settings?.height) || 0;
  const ratio = width && height ? width / height : 0;
  const normalizedLabel = label.toLowerCase();
  const ratioDistance = ratio ? Math.abs(ratio - CAMERA_ASPECT_RATIO) / CAMERA_ASPECT_RATIO : 1;
  const ratioScore = Math.max(0, 34 - ratioDistance * 34);
  const resolutionScore = Math.min(28, ((width * height) / (1920 * 1080)) * 28);
  const fullHdBonus = width >= 1900 && height >= 1000 ? 22 : 0;
  const zoomMin = getCapabilityMin(capabilities?.zoom);
  const zoomBonus = zoomMin !== null ? 14 : 0;
  const modeBonus = modeKey === 'natural' ? 24 : modeKey === 'hd' ? 16 : 0;
  const faceTimeFullHdCropPenalty = /facetime/.test(normalizedLabel) && modeKey === 'fullhd' ? 42 : 0;

  return Math.round(
    ratioScore +
      resolutionScore +
      fullHdBonus +
      zoomBonus +
      modeBonus +
      getWideLabelScore(label) -
      faceTimeFullHdCropPenalty,
  );
}

function getBestCameraProfile(profiles) {
  return [...profiles]
    .filter((profile) => profile.available)
    .sort((first, second) => second.score - first.score)[0] || null;
}

function pickBestWideCamera(profiles, storedSelection) {
  const bestProfile = getBestCameraProfile(profiles);
  const storedProfile = storedSelection.manual
    ? profiles.find((profile) => profile.available && profile.deviceId === storedSelection.deviceId)
    : null;

  if (storedProfile && (!bestProfile || storedProfile.score >= bestProfile.score - 8)) return storedProfile.deviceId;

  return bestProfile?.deviceId || profiles.find((profile) => profile.available)?.deviceId || '';
}

function formatCameraOption(device, index, profile, recommendedCameraId) {
  const label = profile?.label || device.label || `Caméra ${index + 1}`;
  const width = Number(profile?.settings?.width) || 0;
  const height = Number(profile?.settings?.height) || 0;
  const details = [];

  if (device.deviceId === recommendedCameraId) details.push('plan large');
  if (width && height) details.push(`${width}x${height}`);
  if (profile?.modeLabel) details.push(profile.modeLabel);
  if (profile && !profile.available) details.push('test indisponible');

  return details.length ? `${label} · ${details.join(' · ')}` : label;
}

async function scanCameraProfiles(cameraDevices) {
  const profiles = [];

  for (const [index, device] of cameraDevices.entries()) {
    const fallbackLabel = device.label || `Caméra ${index + 1}`;
    const testedProfiles = [];

    for (const mode of CAMERA_TEST_MODES) {
      let stream;

      try {
        stream = await getWideCameraStream(device.deviceId, mode.key);
        const [track] = stream.getVideoTracks();
        const settings = await applyWideCameraTrackSettings(stream, { forceResolution: mode.forceResolution });
        const capabilities = track?.getCapabilities?.() || {};
        const label = device.label || track?.label || fallbackLabel;

        testedProfiles.push({
          deviceId: device.deviceId,
          label,
          settings,
          capabilities,
          modeKey: mode.key,
          modeLabel: mode.label,
          score: scoreCameraProfile(label, settings, capabilities, mode.key),
          available: true,
        });
      } catch (scanError) {
        testedProfiles.push({
          deviceId: device.deviceId,
          label: fallbackLabel,
          settings: {},
          capabilities: {},
          modeKey: mode.key,
          modeLabel: mode.label,
          score: getWideLabelScore(fallbackLabel) - 80,
          available: false,
        });
      } finally {
        stream?.getTracks().forEach((track) => track.stop());
      }
    }

    const bestTestedProfile = getBestCameraProfile(testedProfiles);

    if (bestTestedProfile) {
      profiles.push(bestTestedProfile);
    } else {
      profiles.push({
        deviceId: device.deviceId,
        label: fallbackLabel,
        settings: {},
        capabilities: {},
        modeKey: 'natural',
        modeLabel: 'auto',
        score: getWideLabelScore(fallbackLabel) - 80,
        available: false,
      });
    }
  }

  return profiles;
}

function mergeCameraProfileLabels(profiles, devices) {
  const deviceById = new Map(devices.map((device) => [device.deviceId, device]));

  return profiles.map((profile) => ({
    ...profile,
    label: deviceById.get(profile.deviceId)?.label || profile.label,
  }));
}

function pickRecorderFormat() {
  if (!window.MediaRecorder?.isTypeSupported) {
    return { mimeType: '', extension: 'webm', label: 'WebM' };
  }

  const supportedFormat = RECORDER_FORMATS.find((format) => MediaRecorder.isTypeSupported(format.mimeType));
  return supportedFormat || { mimeType: '', extension: 'webm', label: 'WebM' };
}

function isMp4RecordingSupported() {
  if (!window.MediaRecorder?.isTypeSupported) return false;
  return RECORDER_FORMATS.some((format) => format.extension === 'mp4' && MediaRecorder.isTypeSupported(format.mimeType));
}

function openLibraryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runLibraryTransaction(mode, action) {
  const db = await openLibraryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = action(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function saveLibraryClip(clip) {
  return runLibraryTransaction('readwrite', (store) => store.put(clip));
}

function deleteLibraryClip(id) {
  return runLibraryTransaction('readwrite', (store) => store.delete(id));
}

async function renameLibraryClip(id, name) {
  const db = await openLibraryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const clip = request.result;
      if (!clip) {
        reject(new Error('Clip introuvable.'));
        return;
      }

      store.put({ ...clip, name });
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function readLibraryClips() {
  const db = await openLibraryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      resolve(request.result.sort((first, second) => second.createdAt - first.createdAt));
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

function waitForVideoEvent(video, eventName, timeout = 1600) {
  return new Promise((resolve) => {
    let timeoutId;
    const finish = (success) => {
      clearTimeout(timeoutId);
      video.removeEventListener(eventName, handleEvent);
      resolve(success);
    };
    const handleEvent = () => finish(true);

    video.addEventListener(eventName, handleEvent, { once: true });
    timeoutId = setTimeout(() => finish(false), timeout);
  });
}

function waitForVideoFrame(video) {
  if (typeof video.requestVideoFrameCallback === 'function') {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(resolve, 240);
      video.requestVideoFrameCallback(() => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
  }

  return new Promise((resolve) => setTimeout(resolve, 120));
}

function getThumbnailSeekTimes(duration) {
  if (Number.isFinite(duration) && duration > 0.8) {
    return [
      clampNumber(duration * 0.34, 0.45, Math.max(0.45, duration - 0.15)),
      clampNumber(duration * 0.58, 0.6, Math.max(0.6, duration - 0.1)),
      0.22,
    ];
  }

  return [0.22, 0];
}

function isCanvasMostlyDark(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height).data;
  let luminance = 0;

  for (let index = 0; index < imageData.length; index += 4) {
    luminance += imageData[index] * 0.299 + imageData[index + 1] * 0.587 + imageData[index + 2] * 0.114;
  }

  return luminance / (imageData.length / 4) < 18;
}

function createClipThumbnailUrl(blob) {
  return new Promise(async (resolve) => {
    const videoUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    let resolved = false;
    const cleanup = () => {
      URL.revokeObjectURL(videoUrl);
      video.removeAttribute('src');
      video.load();
    };
    const finish = (url) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(url);
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    const fail = () => {
      finish('');
    };

    const drawThumbnail = () => {
      try {
        const width = 180;
        const height = 320;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const rect = getCoverRect(video.videoWidth || width, video.videoHeight || height, width, height);
        context.fillStyle = '#080a09';
        context.fillRect(0, 0, width, height);
        context.drawImage(video, rect.x, rect.y, rect.width, rect.height);
        return {
          dark: isCanvasMostlyDark(context, width, height),
          url: canvas.toDataURL('image/jpeg', 0.78),
        };
      } catch (thumbnailError) {
        return { dark: true, url: '' };
      }
    };

    video.onerror = fail;
    video.src = videoUrl;

    try {
      const metadataLoaded = video.readyState >= 1 || (await waitForVideoEvent(video, 'loadedmetadata', 2200));
      if (!metadataLoaded || !video.videoWidth || !video.videoHeight) {
        fail();
        return;
      }

      let fallbackUrl = '';
      const seekTimes = getThumbnailSeekTimes(video.duration);

      for (const seekTime of seekTimes) {
        if (seekTime > 0 && Number.isFinite(video.duration)) {
          video.currentTime = Math.min(seekTime, Math.max(0, video.duration - 0.08));
          await waitForVideoEvent(video, 'seeked');
        } else {
          await waitForVideoEvent(video, 'loadeddata', 900);
        }

        await waitForVideoFrame(video);
        const thumbnail = drawThumbnail();
        if (thumbnail.url) fallbackUrl = thumbnail.url;
        if (thumbnail.url && !thumbnail.dark) {
          finish(thumbnail.url);
          return;
        }
      }

      finish(fallbackUrl);
    } catch (thumbnailError) {
      fail();
    }
  });
}

function makeClipName(extension) {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '-').replaceAll(':', '');
  return `retok-take-${stamp}.${extension}`;
}

function getClipTitle(name, extension) {
  const suffix = `.${extension}`;
  if (extension && name.toLowerCase().endsWith(suffix.toLowerCase())) {
    return name.slice(0, -suffix.length);
  }

  return name.replace(/\.[^/.]+$/, '');
}

function makeRenamedClipFileName(title, extension) {
  const cleanedTitle = title.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ');
  const safeTitle = cleanedTitle || 'retok-take';
  const suffix = `.${extension}`;

  return safeTitle.toLowerCase().endsWith(suffix.toLowerCase()) ? safeTitle : `${safeTitle}${suffix}`;
}

function formatClipDate(timestamp) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(timestamp));
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function getCoverRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio > targetRatio) {
    const height = targetHeight;
    const width = height * sourceRatio;
    return { x: (targetWidth - width) / 2, y: 0, width, height };
  }

  const width = targetWidth;
  const height = width / sourceRatio;
  return { x: 0, y: (targetHeight - height) / 2, width, height };
}

function drawVideoFrame(context, video, coverRect, mirrored) {
  context.save();
  if (mirrored) {
    context.translate(TIKTOK_WIDTH, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, coverRect.x, coverRect.y, coverRect.width, coverRect.height);
  context.restore();
}

async function applyWideCameraTrackSettings(stream, { forceResolution = true } = {}) {
  const [track] = stream.getVideoTracks();
  if (!track?.applyConstraints) return track?.getSettings?.() || {};

  const capabilities = track.getCapabilities?.() || {};
  const advanced = {};

  const minZoom = getCapabilityMin(capabilities.zoom);
  if (minZoom !== null) advanced.zoom = minZoom;
  if (capabilities.focusMode?.includes?.('continuous')) advanced.focusMode = 'continuous';
  if (capabilities.exposureMode?.includes?.('continuous')) advanced.exposureMode = 'continuous';

  const constraints = forceResolution
    ? {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: CAMERA_ASPECT_RATIO },
        resizeMode: { ideal: 'none' },
      }
    : {};

  if (Object.keys(advanced).length) constraints.advanced = [advanced];

  try {
    if (Object.keys(constraints).length) await track.applyConstraints(constraints);
  } catch (settingsError) {
    // Some webcams expose capabilities they cannot actually apply. Keep the stream instead of failing camera startup.
  }

  return track.getSettings?.() || {};
}

function makeWhiteBalanceFilter(kelvin, tint) {
  const temperature = clampNumber(kelvin, 2800, 8000);
  const tintValue = clampNumber(tint, -40, 40);
  const warm = Math.max(0, temperature - DEFAULT_WHITE_BALANCE_KELVIN) / 2800;
  const cool = Math.max(0, DEFAULT_WHITE_BALANCE_KELVIN - temperature) / 2400;
  const magenta = Math.max(0, tintValue) / 40;
  const green = Math.max(0, -tintValue) / 40;
  const colorShift = Math.max(warm, cool, magenta, green);

  const brightness = 1.025 + warm * 0.018 - cool * 0.004;
  const contrast = 1.04 + colorShift * 0.018;
  const saturation = 1.08 + Math.max(warm, cool) * 0.08 + Math.max(magenta, green) * 0.045;
  const sepia = warm * 0.18 + magenta * 0.025;
  const hueRotate = cool * 12 - warm * 9 - magenta * 5.5 + green * 5.2;

  return [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturation.toFixed(3)})`,
    `sepia(${sepia.toFixed(3)})`,
    `hue-rotate(${hueRotate.toFixed(2)}deg)`,
  ].join(' ');
}

function applyWhiteBalanceWash(context, width, height, kelvin, tint) {
  const temperature = clampNumber(kelvin, 2800, 8000);
  const tintValue = clampNumber(tint, -40, 40);
  const warm = Math.max(0, temperature - DEFAULT_WHITE_BALANCE_KELVIN) / 2800;
  const cool = Math.max(0, DEFAULT_WHITE_BALANCE_KELVIN - temperature) / 2400;
  const magenta = Math.max(0, tintValue) / 40;
  const green = Math.max(0, -tintValue) / 40;

  context.save();
  context.globalCompositeOperation = 'overlay';
  if (warm) {
    context.fillStyle = `rgba(255, 138, 28, ${0.18 * warm})`;
    context.fillRect(0, 0, width, height);
  }
  if (cool) {
    context.fillStyle = `rgba(34, 124, 255, ${0.19 * cool})`;
    context.fillRect(0, 0, width, height);
  }
  if (magenta) {
    context.fillStyle = `rgba(255, 58, 188, ${0.13 * magenta})`;
    context.fillRect(0, 0, width, height);
  }
  if (green) {
    context.fillStyle = `rgba(24, 220, 116, ${0.125 * green})`;
    context.fillRect(0, 0, width, height);
  }
  context.globalCompositeOperation = 'screen';
  if (warm) {
    context.fillStyle = `rgba(255, 204, 108, ${0.055 * warm})`;
    context.fillRect(0, 0, width, height);
  }
  if (cool) {
    context.fillStyle = `rgba(120, 176, 255, ${0.058 * cool})`;
    context.fillRect(0, 0, width, height);
  }
  context.restore();
}

function getSkinSmoothingBuffers(width, height) {
  const scaledWidth = Math.max(1, Math.round(width * SKIN_SMOOTHING_SCALE));
  const scaledHeight = Math.max(1, Math.round(height * SKIN_SMOOTHING_SCALE));

  if (!skinSmoothingBuffers) {
    skinSmoothingBuffers = {
      source: document.createElement('canvas'),
      blur: document.createElement('canvas'),
      mask: document.createElement('canvas'),
      masked: document.createElement('canvas'),
    };
  }

  Object.values(skinSmoothingBuffers).forEach((canvas) => {
    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }
  });

  return { ...skinSmoothingBuffers, width: scaledWidth, height: scaledHeight };
}

function getSkinMaskAlpha(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max ? (max - min) / max : 0;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const isSkinTone =
    y > 52 &&
    y < 242 &&
    cb > 76 &&
    cb < 145 &&
    cr > 132 &&
    cr < 188 &&
    r > 58 &&
    g > 34 &&
    b > 20 &&
    r > b * 1.04 &&
    saturation > 0.09;

  if (!isSkinTone) return 0;

  const redBias = clampNumber((r - b) / 95, 0, 1);
  const chromaCenter = 1 - clampNumber(Math.abs(cr - 158) / 40, 0, 1);
  const brightnessWeight = 1 - clampNumber(Math.abs(y - 148) / 120, 0, 1) * 0.34;
  return Math.round(155 * Math.max(0.32, redBias) * Math.max(0.55, chromaCenter) * brightnessWeight);
}

function applySubtleSkinSmoothing(context, width, height) {
  const buffers = getSkinSmoothingBuffers(width, height);
  const sourceContext = buffers.source.getContext('2d', { willReadFrequently: true });
  const blurContext = buffers.blur.getContext('2d');
  const maskContext = buffers.mask.getContext('2d', { willReadFrequently: true });
  const maskedContext = buffers.masked.getContext('2d');

  sourceContext.clearRect(0, 0, buffers.width, buffers.height);
  sourceContext.drawImage(context.canvas, 0, 0, buffers.width, buffers.height);

  blurContext.clearRect(0, 0, buffers.width, buffers.height);
  blurContext.filter = 'blur(2.4px)';
  blurContext.drawImage(buffers.source, 0, 0);
  blurContext.filter = 'none';

  const sourcePixels = sourceContext.getImageData(0, 0, buffers.width, buffers.height);
  const maskPixels = maskContext.createImageData(buffers.width, buffers.height);

  for (let index = 0; index < sourcePixels.data.length; index += 4) {
    maskPixels.data[index + 3] = getSkinMaskAlpha(
      sourcePixels.data[index],
      sourcePixels.data[index + 1],
      sourcePixels.data[index + 2],
    );
  }

  maskContext.putImageData(maskPixels, 0, 0);

  maskedContext.clearRect(0, 0, buffers.width, buffers.height);
  maskedContext.globalCompositeOperation = 'source-over';
  maskedContext.drawImage(buffers.blur, 0, 0);
  maskedContext.globalCompositeOperation = 'destination-in';
  maskedContext.drawImage(buffers.mask, 0, 0);
  maskedContext.globalCompositeOperation = 'source-over';

  context.save();
  context.globalAlpha = SKIN_SMOOTHING_ALPHA;
  context.imageSmoothingEnabled = true;
  context.drawImage(buffers.masked, 0, 0, width, height);
  context.restore();
}

function getHalationBuffers(width, height) {
  const scaledWidth = Math.max(1, Math.round(width * HALATION_SCALE));
  const scaledHeight = Math.max(1, Math.round(height * HALATION_SCALE));

  if (!halationBuffers) {
    halationBuffers = {
      source: document.createElement('canvas'),
      highlight: document.createElement('canvas'),
      glow: document.createElement('canvas'),
    };
  }

  Object.values(halationBuffers).forEach((canvas) => {
    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }
  });

  return { ...halationBuffers, width: scaledWidth, height: scaledHeight };
}

function applyHalationGlow(context, width, height) {
  const buffers = getHalationBuffers(width, height);
  const sourceContext = buffers.source.getContext('2d', { willReadFrequently: true });
  const highlightContext = buffers.highlight.getContext('2d', { willReadFrequently: true });
  const glowContext = buffers.glow.getContext('2d');

  sourceContext.clearRect(0, 0, buffers.width, buffers.height);
  sourceContext.drawImage(context.canvas, 0, 0, buffers.width, buffers.height);

  const sourcePixels = sourceContext.getImageData(0, 0, buffers.width, buffers.height);
  const highlightPixels = highlightContext.createImageData(buffers.width, buffers.height);

  for (let index = 0; index < sourcePixels.data.length; index += 4) {
    const r = sourcePixels.data[index];
    const g = sourcePixels.data[index + 1];
    const b = sourcePixels.data[index + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const warmth = clampNumber((r - b + 42) / 118, 0.28, 1);
    const highlightStrength = clampNumber((luminance - 172) / 70, 0, 1);
    const alpha = Math.round(highlightStrength * warmth * 178);

    highlightPixels.data[index] = 255;
    highlightPixels.data[index + 1] = 92 + Math.round(48 * highlightStrength);
    highlightPixels.data[index + 2] = 32;
    highlightPixels.data[index + 3] = alpha;
  }

  highlightContext.clearRect(0, 0, buffers.width, buffers.height);
  highlightContext.putImageData(highlightPixels, 0, 0);

  glowContext.clearRect(0, 0, buffers.width, buffers.height);
  glowContext.filter = 'blur(6px)';
  glowContext.drawImage(buffers.highlight, 0, 0);
  glowContext.filter = 'blur(13px)';
  glowContext.globalAlpha = 0.54;
  glowContext.drawImage(buffers.highlight, 0, 0);
  glowContext.globalAlpha = 1;
  glowContext.filter = 'none';

  context.save();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = HALATION_ALPHA;
  context.imageSmoothingEnabled = true;
  context.drawImage(buffers.glow, 0, 0, width, height);
  context.restore();
}

function getRetroGlowBuffers(width, height) {
  const scaledWidth = Math.max(1, Math.round(width * RETRO_GLOW_SCALE));
  const scaledHeight = Math.max(1, Math.round(height * RETRO_GLOW_SCALE));

  if (!retroGlowBuffers) {
    retroGlowBuffers = {
      source: document.createElement('canvas'),
      glow: document.createElement('canvas'),
    };
  }

  Object.values(retroGlowBuffers).forEach((canvas) => {
    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }
  });

  return { ...retroGlowBuffers, width: scaledWidth, height: scaledHeight };
}

function applyRetroKodakGlow(context, width, height) {
  const buffers = getRetroGlowBuffers(width, height);
  const sourceContext = buffers.source.getContext('2d');
  const glowContext = buffers.glow.getContext('2d');

  sourceContext.clearRect(0, 0, buffers.width, buffers.height);
  sourceContext.drawImage(context.canvas, 0, 0, buffers.width, buffers.height);

  glowContext.clearRect(0, 0, buffers.width, buffers.height);
  glowContext.filter = 'blur(7px) saturate(1.18) brightness(1.08)';
  glowContext.globalAlpha = 0.92;
  glowContext.drawImage(buffers.source, 0, 0);
  glowContext.filter = 'blur(18px) saturate(1.1) brightness(1.05)';
  glowContext.globalAlpha = 0.5;
  glowContext.drawImage(buffers.source, 0, 0);
  glowContext.globalAlpha = 1;
  glowContext.filter = 'none';
  glowContext.globalCompositeOperation = 'source-atop';
  glowContext.fillStyle = 'rgba(255, 176, 72, 0.18)';
  glowContext.fillRect(0, 0, buffers.width, buffers.height);
  glowContext.globalCompositeOperation = 'source-over';

  context.save();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = RETRO_GLOW_ALPHA;
  context.imageSmoothingEnabled = true;
  context.drawImage(buffers.glow, 0, 0, width, height);
  context.restore();

  context.save();
  const warmLift = context.createRadialGradient(width * 0.5, height * 0.43, 0, width * 0.5, height * 0.43, height * 0.72);
  warmLift.addColorStop(0, 'rgba(255, 210, 130, 0.035)');
  warmLift.addColorStop(0.62, 'rgba(255, 150, 72, 0.018)');
  warmLift.addColorStop(1, 'rgba(255, 150, 72, 0)');
  context.globalCompositeOperation = 'screen';
  context.fillStyle = warmLift;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function applyDisposableCameraLook(context, width, height) {
  context.save();
  context.globalCompositeOperation = 'source-atop';
  context.fillStyle = 'rgba(255, 205, 118, 0.078)';
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'screen';
  context.fillStyle = 'rgba(255, 92, 112, 0.034)';
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'overlay';
  context.fillStyle = 'rgba(255, 244, 205, 0.05)';
  context.fillRect(0, 0, width, height);
  context.restore();

  context.save();
  context.globalAlpha = 0.06;
  for (let index = 0; index < DISPOSABLE_NOISE_POINTS; index += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const shade = 150 + Math.random() * 105;
    context.fillStyle = `rgb(${shade}, ${Math.min(255, shade + 7)}, ${Math.max(0, shade - 10)})`;
    context.fillRect(x, y, 1.9, 1.9);
  }
  context.restore();

  context.save();
  const flashBloom = context.createRadialGradient(width * 0.42, height * 0.34, 0, width * 0.42, height * 0.34, height * 0.58);
  flashBloom.addColorStop(0, 'rgba(255, 238, 190, 0.095)');
  flashBloom.addColorStop(0.48, 'rgba(255, 220, 150, 0.028)');
  flashBloom.addColorStop(1, 'rgba(255, 220, 150, 0)');
  context.fillStyle = flashBloom;
  context.fillRect(0, 0, width, height);
  context.restore();

  context.save();
  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.18,
    width / 2,
    height / 2,
    height * 0.64,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.78, 'rgba(0, 0, 0, 0.03)');
  vignette.addColorStop(1, 'rgba(55, 32, 18, 0.22)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function estimateWhiteBalanceFromSample({ r, g, b }) {
  const redBlueDelta = (r - b) / 255;
  const greenDelta = (g - (r + b) / 2) / 255;

  return {
    kelvin: Math.round(clampNumber(DEFAULT_WHITE_BALANCE_KELVIN - redBlueDelta * 4300, 2800, 8000) / 50) * 50,
    tint: Math.round(clampNumber(greenDelta * 135, -40, 40)),
  };
}

export default function App() {
  const previewRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const monitorStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const previewFrameRef = useRef(null);
  const recordingStartedAtRef = useRef(0);
  const recordingFormatRef = useRef(pickRecorderFormat());
  const libraryItemsRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const meterFrameRef = useRef(null);
  const activeCameraIdRef = useRef('');
  const cameraScanRunRef = useRef(0);

  const [cameras, setCameras] = useState([]);
  const [cameraProfiles, setCameraProfiles] = useState([]);
  const [audioInputs, setAudioInputs] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [status, setStatus] = useState('Sources non initialisées');
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioState, setAudioState] = useState('idle');
  const [cameraReady, setCameraReady] = useState(false);
  const [isScanningCameras, setIsScanningCameras] = useState(false);
  const [libraryItems, setLibraryItems] = useState([]);
  const [selectedClipId, setSelectedClipId] = useState('');
  const [renameClipId, setRenameClipId] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [libraryError, setLibraryError] = useState('');
  const [currentView, setCurrentView] = useState('studio');
  const [whiteBalancePickerActive, setWhiteBalancePickerActive] = useState(false);
  const [mirrorEnabled, setMirrorEnabled] = useState(() => localStorage.getItem('retok-mirror-enabled') !== 'false');
  const [whiteBalanceKelvin, setWhiteBalanceKelvin] = useState(() =>
    clampNumber(localStorage.getItem('retok-white-balance-kelvin') || DEFAULT_WHITE_BALANCE_KELVIN, 2800, 8000),
  );
  const [whiteBalanceTint, setWhiteBalanceTint] = useState(() =>
    clampNumber(localStorage.getItem('retok-white-balance-tint') || DEFAULT_WHITE_BALANCE_TINT, -40, 40),
  );
  const whiteBalanceRef = useRef({
    kelvin: whiteBalanceKelvin,
    tint: whiteBalanceTint,
  });
  const whiteBalancePickerActiveRef = useRef(false);
  const mirrorEnabledRef = useRef(mirrorEnabled);

  const cameraProfileById = useMemo(
    () => new Map(cameraProfiles.map((profile) => [profile.deviceId, profile])),
    [cameraProfiles],
  );
  const recommendedCameraId = useMemo(() => getBestCameraProfile(cameraProfiles)?.deviceId || '', [cameraProfiles]);
  const selectedCameraLabel = useMemo(() => {
    const profile = cameraProfileById.get(selectedCameraId);
    return profile?.label || deviceName(cameras, selectedCameraId, 'Caméra');
  }, [cameraProfileById, cameras, selectedCameraId]);
  const selectedAudioLabel = useMemo(
    () => deviceName(audioInputs, selectedAudioId, 'Source audio'),
    [audioInputs, selectedAudioId],
  );
  const isReady = !isScanningCameras && cameraReady && audioInputs.length > 0;
  const selectedClip = useMemo(
    () => libraryItems.find((item) => item.id === selectedClipId) || libraryItems[0] || null,
    [libraryItems, selectedClipId],
  );
  const mp4Supported = useMemo(() => isMp4RecordingSupported(), []);

  useEffect(() => {
    refreshDevices();

    const handleDeviceChange = () => refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      stopCamera({ updateState: false });
      stopAudio();
      stopMeter();
      clearInterval(timerRef.current);
      libraryItemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  useEffect(() => {
    if (currentView === 'studio' && cameras.length && selectedCameraId && !isScanningCameras) {
      startCamera(selectedCameraId);
      return;
    }

    if (currentView === 'library') stopPreviewRenderer();
  }, [cameras.length, currentView, isRecording, isScanningCameras, selectedCameraId]);

  useEffect(() => {
    if (audioInputs.length) startMeter(selectedAudioId);
    return () => stopMeter();
  }, [audioInputs.length, selectedAudioId]);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, [recordingUrl]);

  useEffect(() => {
    loadLibrary();
  }, []);

  useEffect(() => {
    whiteBalanceRef.current = {
      kelvin: whiteBalanceKelvin,
      tint: whiteBalanceTint,
    };
    localStorage.setItem('retok-white-balance-kelvin', String(whiteBalanceKelvin));
    localStorage.setItem('retok-white-balance-tint', String(whiteBalanceTint));
  }, [whiteBalanceKelvin, whiteBalanceTint]);

  useEffect(() => {
    whiteBalancePickerActiveRef.current = whiteBalancePickerActive;
  }, [whiteBalancePickerActive]);

  useEffect(() => {
    mirrorEnabledRef.current = mirrorEnabled;
    localStorage.setItem('retok-mirror-enabled', String(mirrorEnabled));
  }, [mirrorEnabled]);

  function setLibraryRecords(records) {
    libraryItemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    const nextItems = records.map((record) => ({
      ...record,
      url: URL.createObjectURL(record.blob),
      thumbnailUrl: '',
    }));
    libraryItemsRef.current = nextItems;
    setLibraryItems(nextItems);
    hydrateClipThumbnails(nextItems);
  }

  async function hydrateClipThumbnails(items) {
    const hydratedItems = await Promise.all(
      items.map(async (item) => ({
        ...item,
        thumbnailUrl: await createClipThumbnailUrl(item.blob),
      })),
    );

    libraryItemsRef.current = hydratedItems;
    setLibraryItems(hydratedItems);
  }

  async function loadLibrary() {
    try {
      const records = await readLibraryClips();
      setLibraryRecords(records);
      setSelectedClipId((current) => (records.some((record) => record.id === current) ? current : records[0]?.id || ''));
      setLibraryError('');
    } catch (loadError) {
      setLibraryError("Impossible de charger la bibliothèque locale.");
    }
  }

  function applyDeviceList(devices, { updateStatus = true, selectCamera = true } = {}) {
    const nextCameras = devices.filter((device) => device.kind === 'videoinput');
    const nextAudioInputs = devices.filter((device) => device.kind === 'audioinput');

    setCameras(nextCameras);
    setAudioInputs(nextAudioInputs);
    if (selectCamera) {
      setSelectedCameraId((current) =>
        nextCameras.some((device) => device.deviceId === current) ? current : nextCameras[0]?.deviceId || '',
      );
    }
    setSelectedAudioId((current) =>
      nextAudioInputs.some((device) => device.deviceId === current) ? current : nextAudioInputs[0]?.deviceId || '',
    );
    if (updateStatus) setStatus(nextCameras.length && nextAudioInputs.length ? 'Prêt à enregistrer' : 'Source manquante');
  }

  async function refreshDevices() {
    if (isRecording) return;

    const scanRunId = cameraScanRunRef.current + 1;
    cameraScanRunRef.current = scanRunId;

    setError('');
    setIsScanningCameras(true);
    setCameraReady(false);

    if (!navigator.mediaDevices?.enumerateDevices) {
      setStatus('Navigateur incompatible');
      setError("Ce navigateur ne donne pas accès aux caméras et sources audio.");
      setIsScanningCameras(false);
      return;
    }

    stopCamera();
    setStatus('Scan caméras plan large');

    try {
      const audioPermissionStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      audioPermissionStream.getTracks().forEach((track) => track.stop());
    } catch (permissionError) {
      setError("Autorise l'accès caméra et micro pour afficher les sources disponibles.");
    }

    try {
      const cameraPermissionStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: CAMERA_ASPECT_RATIO },
        },
        audio: false,
      });
      cameraPermissionStream.getTracks().forEach((track) => track.stop());
    } catch (permissionError) {
      setError("Autorise l'accès caméra pour détecter la source plan large.");
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameraDevices = devices.filter((device) => device.kind === 'videoinput');

      applyDeviceList(devices, { updateStatus: false, selectCamera: false });

      const profiles = await scanCameraProfiles(cameraDevices);
      const labeledDevices = await navigator.mediaDevices.enumerateDevices().catch(() => devices);
      const labeledProfiles = mergeCameraProfileLabels(profiles, labeledDevices);

      if (scanRunId !== cameraScanRunRef.current) return;

      const storedSelection = readStoredWideCameraSelection();
      const nextCameraId = pickBestWideCamera(labeledProfiles, storedSelection);
      applyDeviceList(labeledDevices, { updateStatus: false, selectCamera: false });
      setCameraProfiles(labeledProfiles);
      setSelectedCameraId(nextCameraId);

      if (nextCameraId) {
        const nextProfile = labeledProfiles.find((profile) => profile.deviceId === nextCameraId);
        saveWideCameraSelection(nextCameraId, storedSelection.manual && nextCameraId === storedSelection.deviceId);
        setStatus(
          nextProfile?.settings?.width && nextProfile?.settings?.height
            ? `Plan large sélectionné · ${nextProfile.settings.width}x${nextProfile.settings.height} · ${nextProfile.modeLabel}`
            : 'Plan large sélectionné',
        );
      } else {
        setStatus(cameraDevices.length ? 'Caméra indisponible' : 'Source manquante');
      }
    } catch (deviceError) {
      if (scanRunId !== cameraScanRunRef.current) return;
      setStatus('Sources indisponibles');
      setError("Impossible d'analyser les caméras disponibles.");
    } finally {
      if (scanRunId === cameraScanRunRef.current) setIsScanningCameras(false);
    }
  }

  async function startCamera(deviceId) {
    setError('');

    if (cameraStreamRef.current?.active && (activeCameraIdRef.current === deviceId || !deviceId)) {
      if (previewRef.current) {
        previewRef.current.srcObject = cameraStreamRef.current;
        previewRef.current.onloadedmetadata = () => startPreviewRenderer();
      }
      startPreviewRenderer();
      setCameraReady(true);
      setStatus('Prêt à enregistrer');
      return;
    }

    stopCamera();
    setCameraReady(false);
    setStatus('Activation caméra');

    try {
      const selectedProfile = cameraProfileById.get(deviceId);
      const selectedMode = getCameraTestMode(selectedProfile?.modeKey);
      const stream = await getWideCameraStream(deviceId, selectedMode.key);
      const cameraSettings = await applyWideCameraTrackSettings(stream, {
        forceResolution: selectedMode.forceResolution,
      });

      cameraStreamRef.current = stream;
      activeCameraIdRef.current = cameraSettings.deviceId || deviceId;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.onloadedmetadata = () => startPreviewRenderer();
      }
      startPreviewRenderer();
      setCameraReady(true);
      setStatus(
        cameraSettings.width && cameraSettings.height
          ? `Prêt à enregistrer · ${cameraSettings.width}x${cameraSettings.height} · ${selectedMode.label}`
          : 'Prêt à enregistrer',
      );
      setCameraProfiles((profiles) =>
        profiles.map((profile) =>
          profile.deviceId === deviceId
            ? {
                ...profile,
                settings: cameraSettings,
                modeKey: selectedMode.key,
                modeLabel: selectedMode.label,
                score: scoreCameraProfile(profile.label, cameraSettings, profile.capabilities, selectedMode.key),
                available: true,
              }
            : profile,
        ),
      );
      navigator.mediaDevices.enumerateDevices?.()
        .then((devices) => applyDeviceList(devices, { updateStatus: false, selectCamera: false }))
        .catch(() => {});
    } catch (cameraError) {
      setCameraReady(false);
      setStatus('Caméra indisponible');
      setError("Impossible d'activer cette caméra. Sélectionne une autre source.");
    }
  }

  function stopCamera({ updateState = true } = {}) {
    stopPreviewRenderer();
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    activeCameraIdRef.current = '';
    if (updateState) setCameraReady(false);
  }

  function stopPreviewRenderer() {
    if (previewFrameRef.current) cancelAnimationFrame(previewFrameRef.current);
    previewFrameRef.current = null;
  }

  function startPreviewRenderer() {
    stopPreviewRenderer();

    const drawFrame = () => {
      const canvas = canvasRef.current;
      const video = previewRef.current;
      const context = canvas?.getContext('2d');

      if (!canvas || !video || !context) return;
      if (canvas.width !== TIKTOK_WIDTH || canvas.height !== TIKTOK_HEIGHT) {
        canvas.width = TIKTOK_WIDTH;
        canvas.height = TIKTOK_HEIGHT;
      }

      context.clearRect(0, 0, TIKTOK_WIDTH, TIKTOK_HEIGHT);
      context.fillStyle = '#080a09';
      context.fillRect(0, 0, TIKTOK_WIDTH, TIKTOK_HEIGHT);

      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const coverRect = getCoverRect(video.videoWidth, video.videoHeight, TIKTOK_WIDTH, TIKTOK_HEIGHT);
        const { kelvin, tint } = whiteBalanceRef.current;
        const mirrored = mirrorEnabledRef.current;

        if (whiteBalancePickerActiveRef.current) {
          drawVideoFrame(context, video, coverRect, mirrored);
          previewFrameRef.current = requestAnimationFrame(drawFrame);
          return;
        }

        context.save();
        context.filter = makeWhiteBalanceFilter(kelvin, tint);
        drawVideoFrame(context, video, coverRect, mirrored);
        context.restore();
        applyWhiteBalanceWash(context, TIKTOK_WIDTH, TIKTOK_HEIGHT, kelvin, tint);
        applySubtleSkinSmoothing(context, TIKTOK_WIDTH, TIKTOK_HEIGHT);
        applyHalationGlow(context, TIKTOK_WIDTH, TIKTOK_HEIGHT);
        applyRetroKodakGlow(context, TIKTOK_WIDTH, TIKTOK_HEIGHT);
        applyDisposableCameraLook(context, TIKTOK_WIDTH, TIKTOK_HEIGHT);
      }

      previewFrameRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();
  }

  function sampleRawVideoPoint(canvasX, canvasY) {
    const video = previewRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = TIKTOK_WIDTH;
    sampleCanvas.height = TIKTOK_HEIGHT;
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    const coverRect = getCoverRect(video.videoWidth, video.videoHeight, TIKTOK_WIDTH, TIKTOK_HEIGHT);
    drawVideoFrame(sampleContext, video, coverRect, mirrorEnabledRef.current);

    const radius = 18;
    const x = clampNumber(canvasX - radius, 0, TIKTOK_WIDTH - radius * 2);
    const y = clampNumber(canvasY - radius, 0, TIKTOK_HEIGHT - radius * 2);
    const imageData = sampleContext.getImageData(x, y, radius * 2, radius * 2).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let index = 0; index < imageData.length; index += 4) {
      r += imageData[index];
      g += imageData[index + 1];
      b += imageData[index + 2];
      count += 1;
    }

    if (!count) return null;
    return { r: r / count, g: g / count, b: b / count };
  }

  function applyAutoWhiteBalance(event) {
    if (!whiteBalancePickerActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = ((event.clientX - rect.left) / rect.width) * TIKTOK_WIDTH;
    const canvasY = ((event.clientY - rect.top) / rect.height) * TIKTOK_HEIGHT;
    const sample = sampleRawVideoPoint(canvasX, canvasY);
    if (!sample) return;

    const nextWhiteBalance = estimateWhiteBalanceFromSample(sample);
    setWhiteBalanceKelvin(nextWhiteBalance.kelvin);
    setWhiteBalanceTint(nextWhiteBalance.tint);
    setWhiteBalancePickerActive(false);
  }

  function stopAudio() {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  }

  function stopMeter() {
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    analyserRef.current?.disconnect?.();
    analyserRef.current = null;
    audioContextRef.current?.close?.();
    audioContextRef.current = null;
    monitorStreamRef.current?.getTracks().forEach((track) => track.stop());
    monitorStreamRef.current = null;
    setAudioLevel(0);
    setAudioState('idle');
  }

  async function startMeter(deviceId) {
    stopMeter();
    setAudioState('checking');

    try {
      const stream = await navigator.mediaDevices.getUserMedia(makeAudioConstraints(deviceId));
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) throw new Error('AudioContext unavailable');

      const audioContext = new AudioContextConstructor();
      await audioContext.resume?.();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);

      monitorStreamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const samples = new Float32Array(analyser.fftSize);
      const startedAt = performance.now();
      let signalSeen = false;

      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        const sum = samples.reduce((total, sample) => total + sample * sample, 0);
        const rms = Math.sqrt(sum / samples.length);
        const nextLevel = Math.min(1, rms * 10);

        signalSeen = signalSeen || rms > 0.012;
        setAudioLevel(nextLevel);
        setAudioState(signalSeen ? 'active' : performance.now() - startedAt > 1600 ? 'silent' : 'checking');
        meterFrameRef.current = requestAnimationFrame(tick);
      };

      tick();
    } catch (meterError) {
      setAudioState('error');
      setAudioLevel(0);
    }
  }

  async function getAudioTracks() {
    const monitorTracks = monitorStreamRef.current?.getAudioTracks().filter((track) => track.readyState === 'live') || [];
    if (monitorTracks.length) {
      const clones = monitorTracks.map((track) => track.clone());
      audioStreamRef.current = new MediaStream(clones);
      return clones;
    }

    const stream = await navigator.mediaDevices.getUserMedia(makeAudioConstraints(selectedAudioId));
    audioStreamRef.current = stream;
    return stream.getAudioTracks();
  }

  async function startRecording() {
    setError('');
    setRecordingUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return '';
    });

    try {
      if (!cameraStreamRef.current?.active) await startCamera(selectedCameraId);

      const canvasStream = canvasRef.current?.captureStream?.(30);
      const videoTracks = canvasStream?.getVideoTracks() || cameraStreamRef.current?.getVideoTracks() || [];
      if (!videoTracks.length) throw new Error('Aucune piste vidéo disponible.');

      const audioTracks = await getAudioTracks();
      const mixedStream = new MediaStream([...videoTracks, ...audioTracks]);
      const recordingFormat = pickRecorderFormat();
      const recorder = new MediaRecorder(
        mixedStream,
        recordingFormat.mimeType ? { mimeType: recordingFormat.mimeType } : undefined,
      );

      chunksRef.current = [];
      recorderRef.current = recorder;
      recordingFormatRef.current = recordingFormat;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const format = recordingFormatRef.current;
        const blob = new Blob(chunksRef.current, { type: format.mimeType || 'video/webm' });
        const duration = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const clip = {
          id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          name: makeClipName(format.extension),
          createdAt: Date.now(),
          duration,
          mimeType: blob.type,
          extension: format.extension,
          formatLabel: format.label,
          blob,
        };

        try {
          await saveLibraryClip(clip);
          await loadLibrary();
          setSelectedClipId(clip.id);
        } catch (saveError) {
          setLibraryError("La vidéo est prête mais n'a pas pu être ajoutée à la bibliothèque.");
        }

        setRecordingUrl(URL.createObjectURL(blob));
        stopAudio();
        setStatus(format.extension === 'mp4' ? 'Take MP4 ajoutée' : 'Take ajoutée en WebM');
      };

      recorder.start(500);
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
      setRecordingSeconds(0);
      setStatus('Enregistrement en cours');
      timerRef.current = setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    } catch (recordingError) {
      stopAudio();
      setStatus('Erreur');
      setError(recordingError.message || "Impossible de lancer l'enregistrement.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    clearInterval(timerRef.current);
    setIsRecording(false);
  }

  function startRenamingClip(clip) {
    setRenameClipId(clip.id);
    setRenameValue(getClipTitle(clip.name, clip.extension));
  }

  async function submitClipRename(event) {
    event.preventDefault();
    const clip = selectedClip;
    if (!clip || renameClipId !== clip.id) return;

    const nextName = makeRenamedClipFileName(renameValue, clip.extension);
    if (nextName === clip.name) {
      setRenameClipId('');
      return;
    }

    try {
      await renameLibraryClip(clip.id, nextName);
      await loadLibrary();
      setSelectedClipId(clip.id);
      setRenameClipId('');
      setLibraryError('');
    } catch (renameError) {
      setLibraryError('Impossible de renommer cette vidéo.');
    }
  }

  async function removeClip(id) {
    try {
      await deleteLibraryClip(id);
      await loadLibrary();
      if (renameClipId === id) setRenameClipId('');
      setLibraryError('');
    } catch (deleteError) {
      setLibraryError('Impossible de supprimer cette vidéo.');
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            {currentView === 'library' ? <Library size={18} /> : <Video size={18} />}
          </span>
          <div>
            <p>ReTok Studio</p>
            <h1>{currentView === 'library' ? 'Bibliothèque' : 'Enregistrer une take'}</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="nav-button"
            type="button"
            disabled={isRecording}
            onClick={() => setCurrentView((view) => (view === 'library' ? 'studio' : 'library'))}
          >
            {currentView === 'library' ? <ArrowLeft size={16} /> : <Library size={16} />}
            {currentView === 'library' ? 'Studio' : `Bibliothèque (${libraryItems.length})`}
          </button>
          <div className="status" aria-live="polite">
            <span className={isRecording ? 'status-dot live' : 'status-dot'} />
            {currentView === 'library' ? `${libraryItems.length} vidéo${libraryItems.length > 1 ? 's' : ''}` : status}
          </div>
        </div>
      </header>

      {currentView === 'studio' ? (
      <section className="workspace">
        <aside className="setup-panel" aria-label="Sources">
          <div className="panel-title">
            <span>Sources</span>
            <button type="button" onClick={refreshDevices} aria-label="Actualiser les sources" disabled={isRecording || isScanningCameras}>
              <RefreshCw size={16} />
            </button>
          </div>

          <label className="source-field" htmlFor="camera-select">
            <span>
              <Camera size={17} />
              Caméra
            </span>
            <select
              id="camera-select"
              value={selectedCameraId}
              onChange={(event) => {
                saveWideCameraSelection(event.target.value, true);
                setSelectedCameraId(event.target.value);
              }}
              disabled={isRecording || isScanningCameras}
            >
              {cameras.map((device, index) => (
                <option key={`camera-${device.deviceId || index}`} value={device.deviceId}>
                  {formatCameraOption(device, index, cameraProfileById.get(device.deviceId), recommendedCameraId)}
                </option>
              ))}
            </select>
          </label>

          <label className="source-field" htmlFor="audio-select">
            <span>
              <Mic2 size={17} />
              Audio
            </span>
            <select
              id="audio-select"
              value={selectedAudioId}
              onChange={(event) => setSelectedAudioId(event.target.value)}
              disabled={isRecording}
            >
              {audioInputs.map((device, index) => (
                <option key={`audio-${device.deviceId || index}`} value={device.deviceId}>
                  {device.label || `Source audio ${index + 1}`}
                </option>
              ))}
            </select>
          </label>

          <div className={`audio-meter ${audioState}`}>
            <div>
              <span>Signal audio</span>
              <strong>
                {audioState === 'active'
                  ? 'reçu'
                  : audioState === 'silent'
                    ? 'silence'
                    : audioState === 'checking'
                      ? 'test'
                      : audioState === 'error'
                        ? 'indisponible'
                        : 'attente'}
              </strong>
            </div>
            <span className="meter-track" aria-hidden="true">
              <span style={{ transform: `scaleX(${audioLevel})` }} />
            </span>
          </div>

          <button
            className={mirrorEnabled ? 'mirror-toggle active' : 'mirror-toggle'}
            type="button"
            disabled={isRecording}
            aria-pressed={mirrorEnabled}
            onClick={() => setMirrorEnabled((enabled) => !enabled)}
          >
            <FlipHorizontal size={16} />
            <span>
              <strong>Miroir</strong>
              <small>{mirrorEnabled ? 'Actif' : 'Désactivé'}</small>
            </span>
          </button>

          <section className="white-balance-panel" aria-label="Balance des blancs">
            <div className="white-balance-head">
              <span>Balance blancs</span>
              <button
                type="button"
                onClick={() => {
                  setWhiteBalancePickerActive(false);
                  setWhiteBalanceKelvin(DEFAULT_WHITE_BALANCE_KELVIN);
                  setWhiteBalanceTint(DEFAULT_WHITE_BALANCE_TINT);
                }}
              >
                Reset
              </button>
            </div>
            <button
              className={whiteBalancePickerActive ? 'auto-white-button active-picker' : 'auto-white-button'}
              type="button"
              onClick={() => setWhiteBalancePickerActive((value) => !value)}
            >
              <Crosshair size={15} />
              {whiteBalancePickerActive ? 'Clique un blanc du rush brut' : 'Pipette sur rush brut'}
            </button>
            <label className="white-balance-control" htmlFor="white-balance-kelvin">
              <span>
                Kelvin
                <strong>{whiteBalanceKelvin}K</strong>
              </span>
              <input
                id="white-balance-kelvin"
                type="range"
                min="2800"
                max="8000"
                step="50"
                value={whiteBalanceKelvin}
                onChange={(event) => setWhiteBalanceKelvin(clampNumber(event.target.value, 2800, 8000))}
              />
            </label>
            <label className="white-balance-control" htmlFor="white-balance-tint">
              <span>
                Vert / Magenta
                <strong>{whiteBalanceTint > 0 ? `+${whiteBalanceTint}` : whiteBalanceTint}</strong>
              </span>
              <input
                id="white-balance-tint"
                type="range"
                min="-40"
                max="40"
                step="1"
                value={whiteBalanceTint}
                onChange={(event) => setWhiteBalanceTint(clampNumber(event.target.value, -40, 40))}
              />
            </label>
          </section>

          <div className="source-summary">
            <p>
              <Check size={15} />
              {selectedCameraLabel}
            </p>
            <p>
              <Check size={15} />
              {selectedAudioLabel}
            </p>
          </div>
          <p className={mp4Supported ? 'format-note' : 'format-note warning'}>
            {mp4Supported
              ? 'Les nouvelles takes seront enregistrées en MP4.'
              : "MP4 natif indisponible dans ce navigateur. Les takes restent consultables en WebM."}
          </p>
        </aside>

        <section className="stage" aria-label="Aperçu et enregistrement">
          <div className={whiteBalancePickerActive ? 'preview-wrap picking-white' : 'preview-wrap'}>
            <video ref={previewRef} className="raw-preview" autoPlay playsInline muted />
            <canvas
              ref={canvasRef}
              width={TIKTOK_WIDTH}
              height={TIKTOK_HEIGHT}
              aria-label="Aperçu TikTok 9:16"
              onClick={applyAutoWhiteBalance}
            />
            {whiteBalancePickerActive && <div className="picker-hint">Rush brut: clique une zone blanche</div>}
            <div className="recording-head">
              <span className={isRecording ? 'rec-pill active' : 'rec-pill'}>{isRecording ? 'REC' : 'READY'}</span>
              <span>{formatTime(recordingSeconds)}</span>
            </div>
          </div>

          <div className="transport">
            {!isRecording ? (
              <button className="record-button" type="button" onClick={startRecording} disabled={!isReady}>
                <Video size={20} />
                Enregistrer
              </button>
            ) : (
              <button className="stop-button" type="button" onClick={stopRecording}>
                <CircleStop size={20} />
                Stop
              </button>
            )}
            {recordingUrl && (
              <a
                className="download-button"
                href={recordingUrl}
                download={`retok-take-${Date.now()}.${recordingFormatRef.current.extension}`}
              >
                <Download size={18} />
                Télécharger
              </a>
            )}
          </div>

          {error && <p className="error-message">{error}</p>}
        </section>
      </section>
      ) : (
        <section className="library-page" aria-label="Bibliothèque">
          <div className="library-viewer">
            {selectedClip ? (
              <>
                <video key={selectedClip.id} src={selectedClip.url} controls playsInline />
                <div className="library-selected-meta">
                  <div>
                    {renameClipId === selectedClip.id ? (
                      <form className="rename-form" onSubmit={submitClipRename}>
                        <input
                          aria-label="Renommer la vidéo"
                          autoFocus
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setRenameClipId('');
                          }}
                        />
                        <button type="submit" aria-label="Valider le nouveau nom">
                          <Check size={15} />
                        </button>
                      </form>
                    ) : (
                      <strong>{selectedClip.name}</strong>
                    )}
                    <span>
                      {formatClipDate(selectedClip.createdAt)} · {formatTime(selectedClip.duration)} · {selectedClip.formatLabel}
                    </span>
                  </div>
                  <div className="library-actions">
                    <button type="button" onClick={() => startRenamingClip(selectedClip)}>
                      <Pencil size={16} />
                      Renommer
                    </button>
                    <a href={selectedClip.url} download={selectedClip.name}>
                      <Download size={16} />
                      Télécharger
                    </a>
                    <button type="button" onClick={() => removeClip(selectedClip.id)}>
                      <Trash2 size={16} />
                      Supprimer
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-library large-empty">
                <Library size={28} />
                <p>Aucune vidéo enregistrée.</p>
              </div>
            )}
          </div>

          <aside className="library-index" aria-label="Liste des vidéos">
            <div className="panel-title">
              <span>Takes</span>
              <strong>{libraryItems.length}</strong>
            </div>
            <div className="clip-list">
              {libraryItems.map((clip) => (
                <article className={clip.id === selectedClip?.id ? 'clip-item active' : 'clip-item'} key={clip.id}>
                  <button className="clip-card" type="button" onClick={() => setSelectedClipId(clip.id)} aria-label={`Consulter ${clip.name}`}>
                    <span className={clip.thumbnailUrl ? 'clip-thumb has-thumbnail' : 'clip-thumb'}>
                      {clip.thumbnailUrl ? <img src={clip.thumbnailUrl} alt="" /> : <Play size={18} />}
                      <small className="clip-date">{formatClipDate(clip.createdAt)}</small>
                      <small className="clip-duration">{formatTime(clip.duration)}</small>
                    </span>
                    <span className="clip-card-meta">
                      <strong>{clip.name}</strong>
                      <small>{clip.formatLabel}</small>
                    </span>
                  </button>
                  <div className="clip-card-actions">
                    <a href={clip.url} download={clip.name} aria-label={`Télécharger ${clip.name}`}>
                      <Download size={14} />
                    </a>
                    <button type="button" onClick={() => removeClip(clip.id)} aria-label={`Supprimer ${clip.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {libraryError && <p className="error-message">{libraryError}</p>}
          </aside>
        </section>
      )}
    </main>
  );
}
