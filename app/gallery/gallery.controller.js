import fs from 'fs'
import path from 'path'
import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'
import { removeUploadedFile, uploadsDir } from '../utils/imageUpload.js'
import { isObjectId, parsePageLimit, trimCaption } from '../utils/validators.js'

/** Редакция текста согласия. При изменении формулировки в UploadPhotoModal — поднять версию. */
export const CONSENT_VERSION = 'v1'

const MAX_PHOTOS_PER_SUBMISSION = 10
const MAX_PENDING_PER_USER = 30

const PUBLIC_SELECT = {
  id: true,
  url: true,
  width: true,
  height: true,
  authorCaption: true,
  placeCaption: true,
  placeSlug: true,
  placeTitle: true,
  createdAt: true,
}

const MY_SELECT = {
  ...PUBLIC_SELECT,
  status: true,
  adminComment: true,
}

// @desc    Public gallery listing (approved only)
// @route   GET /api/gallery
// @access  Public
export const getPublicPhotos = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = parsePageLimit(req.query.limit, 24)
  const skip = (page - 1) * limit
  const where = { status: 'approved' }

  const [items, total] = await Promise.all([
    prisma.galleryPhoto.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
      select: PUBLIC_SELECT,
    }),
    prisma.galleryPhoto.count({ where }),
  ])

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  })
})

// @desc    Submit a batch of photos to the region photo bank
// @route   POST /api/gallery/photos
// @access  Auth (user)
export const createPhotos = asyncHandler(async (req, res) => {
  const { consent, photos } = req.body

  if (consent !== true) {
    res.status(400)
    throw new Error('Необходимо подтвердить передачу фотографий в общее пользование')
  }

  if (!Array.isArray(photos) || photos.length === 0 || photos.length > MAX_PHOTOS_PER_SUBMISSION) {
    res.status(400)
    throw new Error(`Можно отправить от 1 до ${MAX_PHOTOS_PER_SUBMISSION} фотографий за раз`)
  }

  const prepared = photos.map((photo) => {
    const rawName = String(photo?.filename || photo?.url || '').trim()
    const safeName = rawName ? path.basename(rawName) : ''
    return {
      safeName,
      size: Number(photo?.size),
      width: Number(photo?.width),
      height: Number(photo?.height),
      authorCaption: trimCaption(photo?.authorCaption),
      placeCaption: trimCaption(photo?.placeCaption),
      placeId: isObjectId(photo?.placeId) ? String(photo.placeId) : null,
    }
  })

  if (prepared.some((p) => !p.authorCaption || !p.placeCaption)) {
    res.status(400)
    throw new Error('У каждой фотографии должны быть заполнены автор и место')
  }

  if (prepared.some((p) => !p.safeName || !fs.statSync(path.join(uploadsDir, p.safeName), { throwIfNoEntry: false })?.isFile())) {
    res.status(400)
    throw new Error('Некорректный файл')
  }

  const pendingCount = await prisma.galleryPhoto.count({
    where: { uploadedById: req.user.id, status: 'pending' },
  })
  if (pendingCount + prepared.length > MAX_PENDING_PER_USER) {
    res.status(400)
    throw new Error('Слишком много фотографий на модерации, дождитесь проверки')
  }

  const placeIds = [...new Set(prepared.map((p) => p.placeId).filter(Boolean))]
  const places = placeIds.length
    ? await prisma.place.findMany({
        where: { id: { in: placeIds }, isActive: true },
        select: { id: true, slug: true, title: true },
      })
    : []
  const placeById = new Map(places.map((p) => [p.id, p]))

  const consentAt = new Date()

  await prisma.galleryPhoto.createMany({
    data: prepared.map((p) => {
      const place = p.placeId ? placeById.get(p.placeId) : null
      return {
        status: 'pending',
        url: `/uploads/${p.safeName}`,
        filename: p.safeName,
        size: Number.isFinite(p.size) ? p.size : null,
        width: Number.isFinite(p.width) ? p.width : null,
        height: Number.isFinite(p.height) ? p.height : null,
        authorCaption: p.authorCaption,
        placeCaption: p.placeCaption,
        placeId: place ? place.id : null,
        placeSlug: place ? place.slug : null,
        placeTitle: place ? place.title : null,
        uploadedById: req.user.id,
        uploaderName: req.user.name || null,
        uploaderEmail: req.user.email || null,
        consentAt,
        consentVersion: CONSENT_VERSION,
      }
    }),
  })

  res.status(201).json({ created: prepared.length })
})

// @desc    Get current user's photos
// @route   GET /api/gallery/photos/my
// @access  Auth (user)
export const getMyPhotos = asyncHandler(async (req, res) => {
  const items = await prisma.galleryPhoto.findMany({
    where: { uploadedById: req.user.id },
    orderBy: { createdAt: 'desc' },
    select: MY_SELECT,
  })
  res.json(items)
})

// @desc    Delete own photo
// @route   DELETE /api/gallery/photos/:id
// @access  Auth (user)
export const deleteMyPhoto = asyncHandler(async (req, res) => {
  if (!isObjectId(req.params.id)) {
    res.status(404)
    throw new Error('Фотография не найдена')
  }

  const photo = await prisma.galleryPhoto.findFirst({
    where: { id: req.params.id, uploadedById: req.user.id },
  })
  if (!photo) {
    res.status(404)
    throw new Error('Фотография не найдена')
  }

  await prisma.galleryPhoto.delete({ where: { id: photo.id } })
  removeUploadedFile(photo.filename)

  res.json({ message: 'Фотография удалена' })
})
