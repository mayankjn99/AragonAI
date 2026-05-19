const path = require('path');
const sharp = require('sharp');
const ort = require('onnxruntime-node');

const MODEL_PATH = path.join(__dirname, '../../models/version-RFB-320.onnx');
const MIN_FACE_FRACTION = 0.05; // Face bbox must be at least 5% of image area
const CONFIDENCE_THRESHOLD = 0.7;
const INPUT_WIDTH = 320;
const INPUT_HEIGHT = 240;

let session = null;

async function loadModel() {
  if (session) return;
  session = await ort.InferenceSession.create(MODEL_PATH, {
    logSeverityLevel: 3, // suppress warnings
  });
}

/**
 * Preprocess image for UltraFace model: resize to 320x240, normalize to [-1, 1], NCHW format.
 */
async function preprocessImage(filePath) {
  const { data, info } = await sharp(filePath)
    .resize(INPUT_WIDTH, INPUT_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const float32Data = new Float32Array(3 * INPUT_HEIGHT * INPUT_WIDTH);
  const mean = [127, 127, 127];
  const div = 128;

  // Convert HWC -> CHW and normalize
  for (let y = 0; y < INPUT_HEIGHT; y++) {
    for (let x = 0; x < INPUT_WIDTH; x++) {
      const srcIdx = (y * INPUT_WIDTH + x) * 3;
      for (let c = 0; c < 3; c++) {
        const dstIdx = c * INPUT_HEIGHT * INPUT_WIDTH + y * INPUT_WIDTH + x;
        float32Data[dstIdx] = (data[srcIdx + c] - mean[c]) / div;
      }
    }
  }

  return new ort.Tensor('float32', float32Data, [1, 3, INPUT_HEIGHT, INPUT_WIDTH]);
}

/**
 * Run NMS and decode detections from model output.
 */
function decodeDetections(scores, boxes, imgWidth, imgHeight) {
  const numAnchors = scores.dims[1];
  const detections = [];

  for (let i = 0; i < numAnchors; i++) {
    const confidence = scores.data[i * 2 + 1]; // face class score
    if (confidence < CONFIDENCE_THRESHOLD) continue;

    // boxes are [x_min, y_min, x_max, y_max] normalized
    const x1 = boxes.data[i * 4] * imgWidth;
    const y1 = boxes.data[i * 4 + 1] * imgHeight;
    const x2 = boxes.data[i * 4 + 2] * imgWidth;
    const y2 = boxes.data[i * 4 + 3] * imgHeight;

    detections.push({ x1, y1, x2, y2, confidence });
  }

  // Simple NMS with IoU threshold
  return nms(detections, 0.3);
}

function nms(detections, iouThreshold) {
  detections.sort((a, b) => b.confidence - a.confidence);
  const kept = [];

  for (const det of detections) {
    let suppress = false;
    for (const k of kept) {
      if (iou(det, k) > iouThreshold) {
        suppress = true;
        break;
      }
    }
    if (!suppress) kept.push(det);
  }
  return kept;
}

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return intersection / (areaA + areaB - intersection);
}

/**
 * Validates face detection in an image.
 * Rules:
 * - Must contain exactly one face
 * - Face bounding box must not be too small (>= 5% of image area)
 */
async function validateFaces(filePath) {
  await loadModel();

  // Get original dimensions
  const metadata = await sharp(filePath).metadata();
  const imgWidth = metadata.width;
  const imgHeight = metadata.height;

  // Preprocess and run inference
  const inputTensor = await preprocessImage(filePath);
  const results = await session.run({ input: inputTensor });
  const detections = decodeDetections(results.scores, results.boxes, imgWidth, imgHeight);

  if (detections.length === 0) {
    return { valid: false, reason: 'No face detected in the image.', faceCount: 0 };
  }

  if (detections.length > 1) {
    return {
      valid: false,
      reason: `Multiple faces detected (${detections.length}). Only single-face images are accepted.`,
      faceCount: detections.length,
    };
  }

  // Check face bounding box size
  const det = detections[0];
  const faceArea = (det.x2 - det.x1) * (det.y2 - det.y1);
  const imageArea = imgWidth * imgHeight;
  const faceFraction = faceArea / imageArea;

  if (faceFraction < MIN_FACE_FRACTION) {
    return {
      valid: false,
      reason: `Face is too small (${(faceFraction * 100).toFixed(1)}% of image). Minimum: ${(MIN_FACE_FRACTION * 100)}%.`,
      faceCount: 1,
    };
  }

  return { valid: true, faceCount: 1 };
}

module.exports = { validateFaces };
