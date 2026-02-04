import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

// @desc    Get active news (public, no auth)
// @route   GET /api/news
export const getNewsPublic = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = Math.min(parseInt(req.query.limit) || 12, 100)
  const skip = (page - 1) * limit
  const search = (req.query.search || '').trim()

  const typeFilter = req.query.type // 'news' | 'article' — если не указан, по умолчанию news
  const where = { isActive: true }
  if (typeFilter === 'article') {
    where.type = 'article'
  } else {
    where.type = 'news'
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { shortDescription: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.news.findMany({
      where,
      skip,
      take: limit,
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.news.count({ where }),
  ])

  res.json({
    items: items.map((item) => ({
      ...item,
      image: item.image || item.preview || item.images?.[0] || null,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  })
})

// @desc    Get news by slug or id (public, no auth)
// @route   GET /api/news/:idOrSlug
export const getNewsByIdOrSlugPublic = asyncHandler(async (req, res) => {
  const idOrSlug = req.params.idOrSlug
  const isObjectId = /^[a-f\d]{24}$/i.test(idOrSlug)

  const news = isObjectId
    ? await prisma.news.findFirst({
        where: { id: idOrSlug, isActive: true },
      })
    : await prisma.news.findFirst({
        where: { slug: idOrSlug, isActive: true },
      })

  if (!news) {
    res.status(404)
    throw new Error('Новость или статья не найдена')
  }

  res.json({
    ...news,
    image: news.image || news.preview || news.images?.[0] || null,
  })
})
