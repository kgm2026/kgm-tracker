import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const MAX_IMAGES = 10;
export const MAX_VIDEO_FRAMES = 6;
export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

function yieldToMain() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export async function extractVideoFrames(file, numFrames = MAX_VIDEO_FRAMES) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  return new Promise((resolve, reject) => {
    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration;
        const interval = duration / (numFrames + 1);
        const frames = [];

        for (let i = 1; i <= numFrames && i * interval < duration; i++) {
          await yieldToMain();
          const time = i * interval;
          video.currentTime = time;
          await new Promise(r => { video.onseeked = r; });
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          frames.push({ preview: dataUrl, base64: dataUrl.split(',')[1], type: 'image/jpeg', timestamp: time });
        }

        URL.revokeObjectURL(url);
        resolve({ frames, duration, totalFrames: frames.length });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cannot load video')); };
    video.src = url;
  });
}

export async function pdfToImage(file) {
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength === 0) throw new Error('PDF file is empty');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  if (pdf.numPages === 0) throw new Error('PDF has no pages');
  const numPages = pdf.numPages;
  const scale = numPages > 10 ? 1 : numPages > 5 ? 1.5 : 2;
  const pageGap = 4;
  const pageCanvases = [];
  let maxWidth = 0;
  let totalHeight = 0;
  for (let i = 1; i <= numPages; i++) {
    await yieldToMain();
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pageCanvases.push(canvas);
    maxWidth = Math.max(maxWidth, canvas.width);
    totalHeight += canvas.height + (i < numPages ? pageGap : 0);
  }
  const combined = document.createElement('canvas');
  combined.width = maxWidth;
  combined.height = totalHeight;
  const combinedCtx = combined.getContext('2d');
  combinedCtx.fillStyle = '#ffffff';
  combinedCtx.fillRect(0, 0, combined.width, combined.height);
  let yOffset = 0;
  for (const pc of pageCanvases) {
    combinedCtx.drawImage(pc, Math.floor((maxWidth - pc.width) / 2), yOffset);
    yOffset += pc.height + pageGap;
  }
  const dataUrl = combined.toDataURL('image/jpeg', 0.85);
  const previewCanvas = document.createElement('canvas');
  const ps = Math.min(1, 400 / combined.height);
  previewCanvas.width = Math.floor(combined.width * ps);
  previewCanvas.height = Math.floor(combined.height * ps);
  previewCanvas.getContext('2d').drawImage(combined, 0, 0, previewCanvas.width, previewCanvas.height);
  return { preview: previewCanvas.toDataURL('image/jpeg', 0.7), base64: dataUrl.split(',')[1], type: 'image/jpeg', numPages };
}

export const formatDuration = (s) => { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}`; };

export const QUALITY_COLORS = { good: '#10b981', acceptable: '#3b82f6', 'needs-attention': '#f59e0b', concerns: '#f43f5e' };

export const dropZoneStyle = (isDragging, T) => ({
  border: `2px dashed ${isDragging ? T.financial : T.cardBorder}`,
  textAlign: 'center', cursor: 'pointer', marginBottom: 16,
  transition: 'all 0.2s ease', overflow: 'hidden',
  background: isDragging ? T.financial + '10' : 'transparent',
  position: 'relative',
});
