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
  const entityType = req.query.entityType

  const where = {}
  if (status) where.status = status
  if (entityType && ['route', 'place', 'service'].includes(entityType)) where.entityType = entityType

  // Обработка сортировки
  const sortBy = req.query.sortBy || 'createdAt'
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'
  
  // Для authorName и entityTitle нужна сортировка после получения данных
  const needsPostSort = sortBy === 'authorName' || sortBy === 'entityTitle'
  
  let orderBy = { createdAt: 'desc' }
  
  if (!needsPostSort) {
    const sortFieldMap = {
      entityType: 'entityType',
      rating: 'rating',
      createdAt: 'createdAt',
      status: 'status',
    }
    const orderByField = sortFieldMap[sortBy] || 'createdAt'
    orderBy = { [orderByField]: sortOrder }
  }

  // Если нужна пост-сортировка, получаем все данные, сортируем и применяем пагинацию
  let items, total
  
  if (needsPostSort) {
    const allItems = await prisma.review.findMany({
      where,
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
    
    total = allItems.length
    
    // Сортировка в JavaScript
    allItems.sort((a, b) => {
      let aVal, bVal
      if (sortBy === 'authorName') {
        aVal = a.user?.name || ''
        bVal = b.user?.name || ''
      } else if (sortBy === 'entityTitle') {
        // Для entityTitle используем entityId как fallback, так как title в других таблицах
        aVal = a.entityId || ''
        bVal = b.entityId || ''
      }
      
      const comparison = aVal.localeCompare(bVal, 'ru', { sensitivity: 'base' })
      return sortOrder === 'asc' ? comparison : -comparison
    })
    
    // Применяем пагинацию
    items = allItems.slice(skip, skip + limit)
  } else {
    const result = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy,
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
    items = result[0]
    total = result[1]
  }

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
      await prisma.route.update({
        where: { id: entityId },
        data: updateData,
      })
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
