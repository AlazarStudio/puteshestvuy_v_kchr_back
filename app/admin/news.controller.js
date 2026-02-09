import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

const generateSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[а-яё]/g, (char) => {
      const map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
        'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
      }
      return map[char] || char
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// @desc    Get news with pagination
// @route   GET /api/admin/news
// @access  Admin
export const getNews = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  const search = req.query.search || ''

  const where = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { shortDescription: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}

  // Обработка сортировки
  const sortBy = req.query.sortBy || 'createdAt'
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'
  
  // Маппинг полей для сортировки
  const sortFieldMap = {
    title: 'title',
    category: 'category', // В модели News есть поле category
    createdAt: 'createdAt',
    isActive: 'isActive',
  }
  
  const orderByField = sortFieldMap[sortBy] || 'createdAt'
  const orderBy = { [orderByField]: sortOrder }

  const [items, total] = await Promise.all([
    prisma.news.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.news.count({ where }),
  ])

  res.json({
    items: items.map(item => ({
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

// @desc    Get news by id
// @route   GET /api/admin/news/:id
// @access  Admin
export const getNewsById = asyncHandler(async (req, res) => {
  const news = await prisma.news.findUnique({
    where: { id: req.params.id },
  })

  if (!news) {
    res.status(404)
    throw new Error('Новость не найдена')
  }

  res.json(news)
})

// @desc    Create news
// @route   POST /api/admin/news
// @access  Admin
export const createNews = asyncHandler(async (req, res) => {
  const {
    title,
    type,
    category,
    shortDescription,
    preview,
    image,
    publishedAt,
    isActive,
    blocks,
    images,
  } = req.body

  if (!title) {
    res.status(400)
    throw new Error('Заголовок обязателен')
  }

  const slug = generateSlug(title) + '-' + Date.now()

  const news = await prisma.news.create({
    data: {
      title,
      slug,
      type: type || 'news',
      category,
      shortDescription,
      preview: preview || null,
      image: image || null,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      isActive: Boolean(isActive),
      blocks: blocks || [],
      images: images || [],
    },
  })

  res.status(201).json(news)
})

// @desc    Update news (поддерживает частичное обновление, в т.ч. только isActive)
// @route   PUT /api/admin/news/:id
// @access  Admin
export const updateNews = asyncHandler(async (req, res) => {
  const existing = await prisma.news.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Новость не найдена')
  }

  const updateData = {}

  if (req.body.title !== undefined) {
    updateData.title = req.body.title
    updateData.slug = req.body.title !== existing.title
      ? generateSlug(req.body.title) + '-' + Date.now()
      : existing.slug
  }
  if (req.body.type !== undefined) updateData.type = req.body.type
  if (req.body.category !== undefined) updateData.category = req.body.category
  if (req.body.shortDescription !== undefined) updateData.shortDescription = req.body.shortDescription
  if (req.body.preview !== undefined) updateData.preview = req.body.preview
  if (req.body.image !== undefined) updateData.image = req.body.image
  if (req.body.publishedAt !== undefined) updateData.publishedAt = req.body.publishedAt ? new Date(req.body.publishedAt) : null
  if (req.body.isActive !== undefined) updateData.isActive = Boolean(req.body.isActive)
  if (req.body.blocks !== undefined) updateData.blocks = req.body.blocks
  if (req.body.images !== undefined) updateData.images = req.body.images

  const news = await prisma.news.update({
    where: { id: req.params.id },
    data: updateData,
  })

  res.json(news)
})

// @desc    Delete news
// @route   DELETE /api/admin/news/:id
// @access  Admin
export const deleteNews = asyncHandler(async (req, res) => {
  const existing = await prisma.news.findUnique({
    where: { id: req.params.id },
  })

  if (!existing) {
    res.status(404)
    throw new Error('Новость не найдена')
  }

  await prisma.news.delete({
    where: { id: req.params.id },
  })

  res.json({ message: 'Новость удалена' })
})
