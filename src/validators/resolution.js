const sharp = require('sharp');

const MIN_WIDTH = 500;
const MIN_HEIGHT = 500;

/**
 * Validates image resolution (must be at least 500x500).
 * @param {string} filePath - Path to the image file
 * @returns {Promise<{valid: boolean, reason?: string, metadata?: object}>}
 */
async function validateResolution(filePath) {
  const metadata = await sharp(filePath).metadata();
  const { width, height } = metadata;

  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return {
      valid: false,
      reason: `Image resolution too low (${width}x${height}). Minimum required: ${MIN_WIDTH}x${MIN_HEIGHT}.`,
    };
  }

  return { valid: true, metadata };
}

module.exports = { validateResolution };
