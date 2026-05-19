const express = require('express');
const prisma = require('../lib/prisma');
const upload = require('../middleware/upload');
const { convertIfNeeded } = require('../validators/format');
const { validateResolution } = require('../validators/resolution');
const { validateBlurriness } = require('../validators/blurriness');
const { validateFaces } = require('../validators/face');

const router = express.Router();

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, path: filePath } = req.file;

    // Create initial PENDING record
    const image = await prisma.image.create({
      data: {
        originalName: originalname,
        format: mimetype,
        status: 'PENDING',
        storagePath: filePath,
      },
    });

    // Step 1: Format conversion (HEIC → JPEG)
    const { convertedPath, format } = await convertIfNeeded(filePath, mimetype);

    // Step 2: Validate resolution
    const resolutionResult = await validateResolution(convertedPath);
    if (!resolutionResult.valid) {
      const updated = await prisma.image.update({
        where: { id: image.id },
        data: { status: 'REJECTED', rejectionReason: resolutionResult.reason },
      });
      return res.status(200).json(updated);
    }

    // Step 3: Validate blurriness
    const blurResult = await validateBlurriness(convertedPath);
    if (!blurResult.valid) {
      const updated = await prisma.image.update({
        where: { id: image.id },
        data: { status: 'REJECTED', rejectionReason: blurResult.reason },
      });
      return res.status(200).json(updated);
    }

    // Step 4: Validate faces
    const faceResult = await validateFaces(convertedPath);
    if (!faceResult.valid) {
      const updated = await prisma.image.update({
        where: { id: image.id },
        data: { status: 'REJECTED', rejectionReason: faceResult.reason },
      });
      return res.status(200).json(updated);
    }

    // All validations passed — mark as ACCEPTED
    const accepted = await prisma.image.update({
      where: { id: image.id },
      data: {
        status: 'ACCEPTED',
        format,
        storagePath: convertedPath,
      },
    });

    return res.status(201).json(accepted);
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
