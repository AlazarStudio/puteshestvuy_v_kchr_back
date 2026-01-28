import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"
import path from "path"
import fs from "fs"

// @desc    Upload file
// @route   POST /api/admin/media/upload
// @access  Admin
export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400)
    throw new Error('Файл не загружен')
  }

  const file = req.file
  const url = `/uploads/${file.filename}`

  const media = await prisma.media.create({
    data: {
      filename: file.filename,
      url,
      mimetype: file.mimetype,
      size: file.size,
    },
  })

  res.status(201).json({
    id: media.id,
    url,
    filename: media.filename,
  })
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
