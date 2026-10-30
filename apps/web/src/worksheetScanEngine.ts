export async function getOpenCV(): Promise<any> {
  const loaded = await import('@techstark/opencv-js');
  let cv: any = loaded.default;
  if (cv instanceof Promise) cv = await cv;
  if (!cv?.Mat) {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('OpenCV did not finish loading. Try another photo.')), 20_000);
      cv.onRuntimeInitialized = () => { window.clearTimeout(timeout); resolve(); };
    });
  }
  if (!cv?.Mat) throw new Error('OpenCV is unavailable in this browser.');
  return cv;
}

type Point = { x: number; y: number };
type QRLocation = { topLeftCorner: Point; topRightCorner: Point; bottomLeftCorner: Point; bottomRightCorner: Point };

/** Maps the PDF's fixed bubble coordinates into the uploaded photo using its decoded QR corners. */
export function detectWorksheetBubbles(cv: any, canvas: HTMLCanvasElement, location: QRLocation, questionCount: number): Array<number | null> {
  const pdfPageWidth = 595.28;
  const qrBoxSize = 68;
  const qrQuietOffset = 2;
  const qrPdfX = pdfPageWidth - 42 - qrBoxSize + qrQuietOffset;
  const qrPdfY = 30 + qrQuietOffset;
  const qrWidth = Math.hypot(location.topRightCorner.x - location.topLeftCorner.x, location.topRightCorner.y - location.topLeftCorner.y);
  const qrHeight = Math.hypot(location.bottomLeftCorner.x - location.topLeftCorner.x, location.bottomLeftCorner.y - location.topLeftCorner.y);
  const scaleX = qrWidth / (qrBoxSize - qrQuietOffset * 2);
  const scaleY = qrHeight / (qrBoxSize - qrQuietOffset * 2);
  const xVector = { x: (location.topRightCorner.x - location.topLeftCorner.x) / (qrBoxSize - qrQuietOffset * 2), y: (location.topRightCorner.y - location.topLeftCorner.y) / (qrBoxSize - qrQuietOffset * 2) };
  const yVector = { x: (location.bottomLeftCorner.x - location.topLeftCorner.x) / (qrBoxSize - qrQuietOffset * 2), y: (location.bottomLeftCorner.y - location.topLeftCorner.y) / (qrBoxSize - qrQuietOffset * 2) };
  const mat = cv.imread(canvas);
  const gray = new cv.Mat();
  const binary = new cv.Mat();
  try {
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    const detected: Array<number | null> = [];
    for (let question = 0; question < questionCount; question++) {
      const bubbleY = 30 + 88 + 9 + question * 105 + 89;
      const fills: number[] = [];
      for (let option = 0; option < 3; option++) {
        const bubbleX = 42 + 7 + option * 166;
        const dx = bubbleX - qrPdfX;
        const dy = bubbleY - qrPdfY;
        const cx = Math.round(location.topLeftCorner.x + xVector.x * dx + yVector.x * dy);
        const cy = Math.round(location.topLeftCorner.y + xVector.y * dx + yVector.y * dy);
        const radius = Math.max(3, Math.round(Math.min(scaleX, scaleY) * 3.8));
        const left = Math.max(0, cx - radius);
        const top = Math.max(0, cy - radius);
        const right = Math.min(binary.cols, cx + radius + 1);
        const bottom = Math.min(binary.rows, cy + radius + 1);
        if (right <= left || bottom <= top) { fills.push(0); continue; }
        const roi = binary.roi(new cv.Rect(left, top, right - left, bottom - top));
        try { fills.push(cv.countNonZero(roi) / (roi.rows * roi.cols)); }
        finally { roi.delete(); }
      }
      const ranked = fills.map((ratio, index) => ({ ratio, index })).sort((a, b) => b.ratio - a.ratio);
      detected.push(ranked[0]!.ratio > 0.24 && ranked[0]!.ratio - ranked[1]!.ratio > 0.08 ? ranked[0]!.index : null);
    }
    return detected;
  } finally { mat.delete(); gray.delete(); binary.delete(); }
}
