import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'
import { removeUploadedFile } from '../utils/imageUpload.js'
import { isObjectId, trimCaption } from '../utils/validators.js'

const STATUSES = ['pending', 'approved', 'rejected']

/** Резолв места каталога в снапшот подписи */
async function resolvePlace(placeId) {
  if (!isObjectId(placeId)) return null
  return prisma.place.findUnique({
    where: { id: String(placeId) },
    select: { id: true, slug: true, title: true },
  })
}

// @desc    Get gallery photos with pagination
// @route   GET /api/admin/gallery
export const getGalleryPhotos = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(parseInt(req.query.limit) || 24, 100)
  const skip = (page - 1) * limit
  const status = STATUSES.includes(req.query.status) ? req.query.status : undefined
  const where = status ? { status } : {}

  const [items, total] = await Promise.all([
    prisma.galleryPhoto.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.galleryPhoto.count({ where }),
  ])

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  })
})

// @desc    Pending photos count
// @route   GET /api/admin/gallery/pending-count
export const getGalleryPendingCount = asyncHandler(async (req, res) => {
  const count = await prisma.galleryPhoto.count({ where: { status: 'pending' } })
  res.json({ count })
})

// @desc    Update photo (status / captions / place / order)
// @route   PUT /api/admin/gallery/:id
export const updateGalleryPhoto = asyncHandler(async (req, res) => {
  if (!isObjectId(req.params.id)) {
    res.status(404)
    throw new Error('Фотография не найдена')
  }

  const existing = await prisma.galleryPhoto.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404)
    throw new Error('Фотография не найдена')
  }

  const data = {}

  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) {
      res.status(400)
      throw new Error('Недопустимый статус')
    }
    data.status = req.body.status
    data.moderatedAt = new Date()
    data.moderatedById = req.user.id
  }
  if (req.body.adminComment !== undefined) data.adminComment = req.body.adminComment || null
  if (req.body.authorCaption !== undefined) data.authorCaption = trimCaption(req.body.authorCaption)
  if (req.body.placeCaption !== undefined) data.placeCaption = trimCaption(req.body.placeCaption)
  if (req.body.sortOrder !== undefined) {
    const sortOrder = Number(req.body.sortOrder)
    if (!Number.isFinite(sortOrder)) {
      res.status(400)
      throw new Error('Недопустимое значение порядка сортировки')
    }
    data.sortOrder = sortOrder
  }
  if (req.body.placeId !== undefined) {
    const place = await resolvePlace(req.body.placeId)
    data.placeId = place ? place.id : null
    data.placeSlug = place ? place.slug : null
    data.placeTitle = place ? place.title : null
  }

  if (data.authorCaption === '' || data.placeCaption === '') {
    res.status(400)
    throw new Error('Подписи автора и места не могут быть пустыми')
  }

  const updated = await prisma.galleryPhoto.update({ where: { id: existing.id }, data })
  res.json(updated)
})

// @desc    Bulk approve / reject
// @route   POST /api/admin/gallery/bulk
export const bulkUpdateGalleryPhotos = asyncHandler(async (req, res) => {
  const { ids, status, adminComment } = req.body

  if (!STATUSES.includes(status)) {
    res.status(400)
    throw new Error('Недопустимый статус')
  }

  const validIds = Array.isArray(ids) ? ids.filter(isObjectId) : []
  if (validIds.length === 0) {
    res.status(400)
    throw new Error('Не выбрано ни одной фотографии')
  }

  const result = await prisma.galleryPhoto.updateMany({
    where: { id: { in: validIds } },
    data: {
      status,
      adminComment: adminComment !== undefined ? (adminComment || null) : undefined,
      moderatedAt: new Date(),
      moderatedById: req.user.id,
    },
  })

  res.json({ updated: result.count })
})

// @desc    Delete photo (record + file)
// @route   DELETE /api/admin/gallery/:id
export const deleteGalleryPhoto = asyncHandler(async (req, res) => {
  if (!isObjectId(req.params.id)) {
    res.status(404)
    throw new Error('Фотография не найдена')
  }

  const photo = await prisma.galleryPhoto.findUnique({ where: { id: req.params.id } })
  if (!photo) {
    res.status(404)
    throw new Error('Фотография не найдена')
  }

  await prisma.galleryPhoto.delete({ where: { id: photo.id } })
  removeUploadedFile(photo.filename)

  res.json({ message: 'Фотография удалена' })
})
