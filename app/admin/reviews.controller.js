import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

// @desc    Get reviews with pagination
// @route   GET /api/admin/reviews
// @access  Admin
export const getReviews = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  const status = req.query.status

  const where = status ? { status } : {}

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.review.count({ where }),
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

// @desc    Get review by id
// @route   GET /api/admin/reviews/:id
// @access  Admin
export const getReviewById = asyncHandler(async (req, res) => {
  const review = await prisma.review.findUnique({
    where: { id: req.params.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  })

  if (!review) {
    res.status(404)
    throw new Error('Отзыв не найден')
  }

  res.json(review)
})

// @desc    Update review (moderate)
// @route   PUT /api/admin/reviews/:id
// @access  Admin
export const updateReview = asyncHandler(async (req, res) => {
  const existing = await prisma.review.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Отзыв не найден')
  }

  const { status, text } = req.body

  const review = await prisma.review.update({
    where: { id: req.params.id },
    data: {
      status: status || undefined,
      text: text || undefined,
    },
  })

  // Обновляем счётчик отзывов и рейтинг для связанной сущности
  if (status === 'approved' || status === 'rejected') {
    await updateEntityRating(existing.entityType, existing.entityId)
  }

  res.json(review)
})

// @desc    Delete review
// @route   DELETE /api/admin/reviews/:id
// @access  Admin
export const deleteReview = asyncHandler(async (req, res) => {
  const existing = await prisma.review.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Отзыв не найден')
  }

  await prisma.review.delete({
    where: { id: req.params.id },
  })

  // Обновляем счётчик отзывов и рейтинг для связанной сущности
  await updateEntityRating(existing.entityType, existing.entityId)

  res.json({ message: 'Отзыв удалён' })
})

// Вспомогательная функция для обновления рейтинга
async function updateEntityRating(entityType, entityId) {
  const reviews = await prisma.review.findMany({
    where: {
      entityType,
      entityId,
      status: 'approved',
    },
    select: { rating: true },
  })

  const count = reviews.length
  const avgRating = count > 0 
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / count 
    : 0

  const updateData = {
    rating: Math.round(avgRating * 10) / 10,
    reviewsCount: count,
  }

  switch (entityType) {
    case 'route':
      // Routes не имеют полей rating/reviewsCount в текущей схеме
      break
    case 'place':
      await prisma.place.update({
        where: { id: entityId },
        data: updateData,
      })
      break
    case 'service':
      await prisma.service.update({
        where: { id: entityId },
        data: updateData,
      })
      break
  }
}
