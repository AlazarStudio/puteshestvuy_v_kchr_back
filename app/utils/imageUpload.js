import fs from "fs"
import path from "path"
import multer from "multer"
import sharp from "sharp"

export const uploadsDir = path.join(process.cwd(), "uploads")

/** Как в alazarstudio: даунскейл очень больших изображений перед WebP */
export const MAX_IMAGE_DIMENSION = 2560
export const WEBP_QUALITY = 78
export const WEBP_EFFORT = 6

export const imageDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
      }
      cb(null, uploadsDir)
    } catch (e) {
      cb(e)
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase()
    const safeExt = ext && ext.length <= 12 ? ext : ""
    const finalExt = safeExt || ".bin"
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${finalExt}`)
  },
})

async function convertImageFileToWebp(inputPath, outputPath) {
  const meta = await sharp(inputPath).metadata()
  let pipeline = sharp(inputPath).rotate()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION) {
    pipeline = pipeline.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
  }
  await pipeline.webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT }).toFile(outputPath)
}

/**
 * Обработка загруженного на диск изображения: WebP с rotate/resize, SVG/GIF/уже-WebP без перекодирования,
 * при ошибке sharp — оставляем оригинал (как в alazarstudio).
 *
 * @param {string} inputPath — абсолютный путь к временному файлу
 * @param {string} uploadsDirAbs — абсолютный каталог uploads
 * @param {string} originalFilename — имя файла (basename), как выдал multer
 * @param {string} mimetype
 * @returns {Promise<{ filename: string, finalMimetype: string, size: number }>}
 */
export async function finalizeUploadedImage(
  inputPath,
  uploadsDirAbs,
  originalFilename,
  mimetype
) {
  const fileExt = path.extname(originalFilename || "").toLowerCase()
  const basename = path.basename(originalFilename || "")

  if (mimetype === "image/svg+xml") {
    const stat = fs.statSync(inputPath)
    return { filename: basename, finalMimetype: mimetype, size: stat.size }
  }
  if (mimetype === "image/webp" || fileExt === ".webp") {
    const stat = fs.statSync(inputPath)
    return { filename: basename, finalMimetype: mimetype, size: stat.size }
  }
  if (mimetype === "image/gif" || fileExt === ".gif") {
    const stat = fs.statSync(inputPath)
    return { filename: basename, finalMimetype: mimetype, size: stat.size }
  }

  const parsed = path.parse(originalFilename || "file")
  const webpFilename = `${parsed.name || "file"}.webp`
  const webpPath = path.join(uploadsDirAbs, webpFilename)

  try {
    await convertImageFileToWebp(inputPath, webpPath)
    fs.unlinkSync(inputPath)
    const stats = fs.statSync(webpPath)
    return { filename: webpFilename, finalMimetype: "image/webp", size: stats.size }
  } catch (error) {
    if (fs.existsSync(webpPath)) {
      try {
        fs.unlinkSync(webpPath)
      } catch (_) {
        /* ignore */
      }
    }
    console.warn("Image conversion skipped, keeping original file:", error?.message || error)
    const stat = fs.statSync(inputPath)
    return { filename: basename, finalMimetype: mimetype, size: stat.size }
  }
}
