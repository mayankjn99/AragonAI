const sharp = require('sharp');
const path = require('path');

/**
 * If the image is HEIC format, converts it to JPEG.
 * Returns the new file path (or the original path if no conversion needed).
 *
 * @param {string} filePath - Path to the uploaded file
 * @param {string} mimetype - The original mimetype of the file
 * @returns {Promise<{convertedPath: string, format: string}>}
 */
async function convertIfNeeded(filePath, mimetype) {
  if (mimetype === 'image/heic') {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath, path.extname(filePath));
    const convertedPath = path.join(dir, `${basename}.jpg`);

    await sharp(filePath).jpeg({ quality: 90 }).toFile(convertedPath);

    return { convertedPath, format: 'image/jpeg' };
  }

  return { convertedPath: filePath, format: mimetype };
}

module.exports = { convertIfNeeded };
