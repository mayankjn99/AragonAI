const sharp = require('sharp');

/**
 * Checks image blurriness using Laplacian variance.
 * Computes the variance of a Laplacian-convolved grayscale image.
 * Low variance = blurry image.
 *
 * @param {string} filePath - Path to the image file
 * @param {number} threshold - Minimum variance to consider "not blurry" (default: 100)
 * @returns {Promise<{valid: boolean, reason?: string, variance?: number}>}
 */
async function validateBlurriness(filePath, threshold = 100) {
  // Convert to grayscale and get raw pixel data
  const { data, info } = await sharp(filePath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // Apply Laplacian kernel (3x3): [0,1,0; 1,-4,1; 0,1,0]
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        -4 * data[idx] +
        data[(y - 1) * width + x] +
        data[(y + 1) * width + x] +
        data[y * width + (x - 1)] +
        data[y * width + (x + 1)];

      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  if (variance < threshold) {
    return {
      valid: false,
      reason: `Image is too blurry (variance: ${variance.toFixed(2)}, threshold: ${threshold}).`,
      variance,
    };
  }

  return { valid: true, variance };
}

module.exports = { validateBlurriness };
