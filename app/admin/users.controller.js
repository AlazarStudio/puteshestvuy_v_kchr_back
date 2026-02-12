import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"
import { UserFields } from "../utils/user.utils.js"

// @desc    Get all users with pagination
// @route   GET /api/admin/users
// @access  Admin
export const getUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  const search = req.query.search || ''
  const currentUserRole = req.user?.role

  const where = {}
  
  // Фильтрация по роли в зависимости от текущего пользователя
  // ADMIN видит только USER, SUPERADMIN видит всех
  if (currentUserRole === 'ADMIN') {
    // Администратор видит только обычных пользователей
    where.role = 'USER'
  } else if (currentUserRole === 'SUPERADMIN') {
    // Суперадминистратор видит всех (USER, ADMIN, SUPERADMIN)
    const roleFilter = req.query.role
    const includeSuperadmin = req.query.includeSuperadmin === 'true'
    
    if (roleFilter === 'SUPERADMIN' || roleFilter === 'ADMIN') {
      where.role = roleFilter
    } else if (!includeSuperadmin) {
      // По умолчанию исключаем администраторов (показываем только USER)
      where.role = 'USER'
    }
    // Если includeSuperadmin === 'true' и roleFilter не указан, показываем всех
  }
  
  if (search) {
    const searchConditions = [
      { email: { contains: search, mode: 'insensitive' } },
      { login: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ]
    
    if (where.role) {
      // Если уже есть фильтр по роли, добавляем поиск через AND
      where.AND = [
        { role: where.role },
        { OR: searchConditions }
      ]
      delete where.role
    } else {
      where.OR = searchConditions
    }
  }

  // Обработка сортировки
  const sortBy = req.query.sortBy || 'createdAt'
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'
  
  const sortFieldMap = {
    email: 'email',
    login: 'login',
    name: 'name',
    role: 'role',
    createdAt: 'createdAt',
  }
  
  const orderBy = {
    [sortFieldMap[sortBy] || 'createdAt']: sortOrder
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: UserFields,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.user.count({ where }),
  ])

  const pages = Math.ceil(total / limit)

  res.json({
    items: users,
    pagination: {
      page,
      pages,
      total,
      limit,
    },
  })
})

// @desc    Get user by ID
// @route   GET /api/admin/users/:id
// @access  Admin
export const getUserById = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: UserFields,
  })

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  res.json(user)
})

// @desc    Update user role
// @route   PUT /api/admin/users/:id/role
// @access  SuperAdmin only
export const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body
  const currentUserRole = req.user?.role

  // Только SUPERADMIN может менять роли
  if (currentUserRole !== 'SUPERADMIN') {
    res.status(403)
    throw new Error("Only superadmin can change user roles")
  }

  if (!role || !['SUPERADMIN', 'ADMIN', 'USER'].includes(role)) {
    res.status(400)
    throw new Error("Invalid role. Must be SUPERADMIN, ADMIN, or USER")
  }

  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
  })

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.params.id },
    data: { role },
    select: UserFields,
  })

  res.json(updatedUser)
})

// @desc    Ban user
// @route   PUT /api/admin/users/:id/ban
// @access  Admin
export const banUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
  })

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Нельзя забанить администратора или суперадминистратора
  if (user.role === 'ADMIN' || user.role === 'SUPERADMIN') {
    res.status(403)
    throw new Error("Cannot ban administrators")
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.params.id },
    data: { isBanned: true },
    select: UserFields,
  })

  res.json(updatedUser)
})

// @desc    Unban user
// @route   PUT /api/admin/users/:id/unban
// @access  Admin
export const unbanUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
  })

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.params.id },
    data: { isBanned: false },
    select: UserFields,
  })

  res.json(updatedUser)
})
