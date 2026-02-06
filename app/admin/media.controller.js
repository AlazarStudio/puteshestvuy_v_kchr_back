import asyncHandler from "express-async-handler"
import sharp from "sharp"
import { prisma } from "../prisma.js"
import path from "path"
import fs from "fs"
const uploadsDir = path.join(process.cwd(), "uploads")
const WEBP_QUALITY = 85

function uniqueFilename(ext) {
  return `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`
}

// @desc    Upload image (конвертация в WebP, SVG сохраняется как есть)
// @route   POST /api/admin/media/upload
// @access  Admin
export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    res.status(400)
    throw new Error("Файл не загружен")
  }

  const { buffer, mimetype } = req.file

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  let filename
  let finalMimetype = mimetype
  let size

  // SVG sharp не конвертирует — сохраняем как есть
  if (mimetype === "image/svg+xml") {
    filename = uniqueFilename(".svg")
    const filePath = path.join(uploadsDir, filename)
    fs.writeFileSync(filePath, buffer)
    size = buffer.length
  } else {
    // Остальные форматы → WebP
    filename = uniqueFilename(".webp")
    const filePath = path.join(uploadsDir, filename)
    await sharp(buffer)
      .webp({ quality: WEBP_QUALITY })
      .toFile(filePath)
    const stat = fs.statSync(filePath)
    size = stat.size
    finalMimetype = "image/webp"
  }

  const url = `/uploads/${filename}`

  const media = await prisma.media.create({
    data: {
      filename,
      url,
      mimetype: finalMimetype,
      size,
    },
  })

  res.status(201).json({
    id: media.id,
    url,
    filename: media.filename,
  })
})

const DOC_EXT = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
}

// @desc    Upload document (PDF, DOC, DOCX — без конвертации)
// @route   POST /api/admin/media/upload-document
// @access  Admin
export const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    res.status(400)
    throw new Error("Файл не загружен")
  }

  const { buffer, mimetype, originalname } = req.file
  const ext = DOC_EXT[mimetype] || path.extname(originalname || '') || '.bin'

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  const filename = uniqueFilename(ext)
  const filePath = path.join(uploadsDir, filename)
  fs.writeFileSync(filePath, buffer)
  const size = buffer.length
  const url = `/uploads/${filename}`

  const media = await prisma.media.create({
    data: { filename, url, mimetype, size },
  })

  res.status(201).json({
    id: media.id,
    url,
    filename: media.filename,
  })
})

// @desc    Upload video (сохраняется как есть, без конвертации)
// @route   POST /api/admin/media/upload-video
// @access  Admin
export const uploadVideo = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    res.status(400)
    throw new Error("Видеофайл не загружен")
  }

  const { buffer, mimetype, originalname } = req.file
  const ext = path.extname(originalname || "") || ".mp4"
  const safeExt = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"].includes(ext.toLowerCase()) ? ext : ".mp4"

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  const filename = uniqueFilename(safeExt)
  const filePath = path.join(uploadsDir, filename)
  fs.writeFileSync(filePath, buffer)
  const size = buffer.length
  const url = `/uploads/${filename}`

  await prisma.media.create({
    data: { filename, url, mimetype, size },
  })

  res.status(201).json({ url, filename })
})

// @desc    Get all media files
// @route   GET /api/admin/media
// @access  Admin
export const getMedia = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 20
  const skip = (page - 1) * limit

  const [items, total] = await Promise.all([
    prisma.media.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.media.count(),
  ])

  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  })
})

// @desc    Delete media file
// @route   DELETE /api/admin/media/:id
// @access  Admin
export const deleteMedia = asyncHandler(async (req, res) => {
  const media = await prisma.media.findUnique({
    where: { id: req.params.id },
  })

  if (!media) {
    res.status(404)
    throw new Error('Файл не найден')
  }

  // Удаляем файл с диска
  const filePath = path.join(process.cwd(), 'uploads', media.filename)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }

  // Удаляем запись из БД
  await prisma.media.delete({
    where: { id: req.params.id },
  })

  res.json({ message: 'Файл удалён' })
})
