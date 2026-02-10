import { hash, verify } from "argon2"
import asyncHandler from "express-async-handler"
import sharp from "sharp"
import path from "path"
import fs from "fs"

import { prisma } from "../prisma.js"
import { UserFields } from "../utils/user.utils.js"

const uploadsDir = path.join(process.cwd(), "uploads")
const WEBP_QUALITY = 85

function uniqueFilename(ext) {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
}

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: {
      id: req.user.id
    },
    select: UserFields
  })

  res.json(user)
})

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateUserProfile = asyncHandler(async (req, res) => {
  const { name, email, password, userInformation, avatar, currentPassword, newPassword } = req.body

  const updateData = {}

  if (name) updateData.name = name
  if (email) {
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })
    if (existingUser && existingUser.id !== req.user.id) {
      res.status(400)
      throw new Error("Email already in use")
    }
    updateData.email = email
  }
  // Новый способ смены пароля: currentPassword + newPassword
  if (currentPassword || newPassword) {
    if (!currentPassword || !newPassword) {
      res.status(400)
      throw new Error("Both currentPassword and newPassword are required")
    }
    if (newPassword.length < 6) {
      res.status(400)
      throw new Error("Password must be at least 6 characters")
    }

    const existing = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true }
    })

    if (!existing || !existing.password) {
      res.status(400)
      throw new Error("Не удалось проверить текущий пароль")
    }

    const isMatch = await verify(existing.password, currentPassword)
    if (!isMatch) {
      res.status(400)
      throw new Error("Неверный текущий пароль")
    }

    updateData.password = await hash(newPassword)
  } else if (password) {
    // Backward compatibility: simple password change without old password
    if (password.length < 6) {
      res.status(400)
      throw new Error("Password must be at least 6 characters")
    }
    updateData.password = await hash(password)
  }
  if (typeof avatar !== "undefined") {
    updateData.avatar = avatar || null
  }
  if (userInformation) updateData.userInformation = userInformation

  const updatedUser = await prisma.user.update({
    where: {
      id: req.user.id
    },
    data: updateData,
    select: UserFields
  })

  res.json(updatedUser)
})

// @desc    Upload user avatar (with WebP conversion, similar to admin media upload)
// @route   POST /api/users/profile/avatar
// @access  Private
export const uploadUserAvatar = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    res.status(400)
    throw new Error("Файл не загружен")
  }

  const { buffer, mimetype } = req.file

  if (!mimetype.startsWith("image/")) {
    res.status(400)
    throw new Error("Недопустимый тип файла. Разрешены только изображения.")
  }

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  let filename
  let finalMimetype = mimetype

  if (mimetype === "image/svg+xml") {
    filename = uniqueFilename(".svg")
    const filePath = path.join(uploadsDir, filename)
    fs.writeFileSync(filePath, buffer)
  } else {
    filename = uniqueFilename(".webp")
    const filePath = path.join(uploadsDir, filename)
    await sharp(buffer)
      .webp({ quality: WEBP_QUALITY })
      .toFile(filePath)
    finalMimetype = "image/webp"
  }

  const url = `/uploads/${filename}`

  const updatedUser = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatar: url },
    select: UserFields
  })

  res.status(201).json({
    ...updatedUser,
    avatarMimeType: finalMimetype
  })
})

const VALID_ENTITY_TYPES = ["route", "place", "service"]
const ENTITY_KEY_MAP = {
  route: "favoriteRouteIds",
  place: "favoritePlaceIds",
  service: "favoriteServiceIds"
}

// @desc    Get user favorites
// @route   GET /api/users/profile/favorites
// @access  Private
export const getFavorites = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      favoriteRouteIds: true,
      favoritePlaceIds: true,
      favoriteServiceIds: true
    }
  })
  res.json(user || { favoriteRouteIds: [], favoritePlaceIds: [], favoriteServiceIds: [] })
})

// @desc    Get constructor place IDs
// @route   GET /api/users/constructor-points
// @access  Private
export const getConstructorPoints = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { constructorPlaceIds: true }
  })
  const placeIds = Array.isArray(user?.constructorPlaceIds) ? user.constructorPlaceIds : []
  res.json({ placeIds })
})

// @desc    Update constructor place IDs
// @route   PUT /api/users/constructor-points
// @access  Private
export const updateConstructorPoints = asyncHandler(async (req, res) => {
  const placeIds = Array.isArray(req.body?.placeIds)
    ? req.body.placeIds.filter((id) => typeof id === "string" && id)
    : []

  await prisma.user.update({
    where: { id: req.user.id },
    data: { constructorPlaceIds: placeIds }
  })

  res.json({ placeIds })
})

// @desc    Add to favorites
// @route   POST /api/users/favorites/:entityType/:entityId
// @access  Private
export const addFavorite = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    res.status(400)
    throw new Error("Invalid entity type. Use route, place, or service")
  }

  const key = ENTITY_KEY_MAP[entityType]

  if (entityType === "route") {
    const exists = await prisma.route.findUnique({ where: { id: entityId } })
    if (!exists) {
      res.status(404)
      throw new Error("Route not found")
    }
  } else if (entityType === "place") {
    const exists = await prisma.place.findUnique({ where: { id: entityId } })
    if (!exists) {
      res.status(404)
      throw new Error("Place not found")
    }
  } else if (entityType === "service") {
    const exists = await prisma.service.findUnique({ where: { id: entityId } })
    if (!exists) {
      res.status(404)
      throw new Error("Service not found")
    }
  }

  const current = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { [key]: true }
  })
  const ids = Array.isArray(current[key]) ? current[key] : []
  if (ids.includes(entityId)) {
    const userFull = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: UserFields
    })
    return res.json(userFull)
  }

  const newIds = [...ids, entityId]
  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { [key]: newIds },
    select: UserFields
  })
  res.json(updated)
})

// @desc    Remove from favorites
// @route   DELETE /api/users/favorites/:entityType/:entityId
// @access  Private
export const removeFavorite = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    res.status(400)
    throw new Error("Invalid entity type. Use route, place, or service")
  }

  const key = ENTITY_KEY_MAP[entityType]

  const current = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { [key]: true }
  })
  const ids = Array.isArray(current[key]) ? current[key].filter((id) => id !== entityId) : []

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { [key]: ids },
    select: UserFields
  })
  res.json(updated)
})

// =============== ПОЛЬЗОВАТЕЛЬСКИЕ МАРШРУТЫ ===============

// @desc    Get all user routes for current user
// @route   GET /api/users/routes
// @access  Private
export const getUserRoutes = asyncHandler(async (req, res) => {
  const routes = await prisma.userRoute.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" }
  })
  res.json(routes)
})

// @desc    Get single user route
// @route   GET /api/users/routes/:id
// @access  Private
export const getUserRouteById = asyncHandler(async (req, res) => {
  const route = await prisma.userRoute.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  })

  if (!route) {
    res.status(404)
    throw new Error("Маршрут не найден")
  }

  res.json(route)
})

// @desc    Create new user route
// @route   POST /api/users/routes
// @access  Private
export const createUserRoute = asyncHandler(async (req, res) => {
  const { title, description, placeIds, notes, isActive } = req.body

  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400)
    throw new Error("Название маршрута обязательно")
  }

  const placeIdsArray = Array.isArray(placeIds) ? placeIds.filter(Boolean) : []

  const route = await prisma.userRoute.create({
    data: {
      userId: req.user.id,
      title: title.trim(),
      description: description || null,
      placeIds: placeIdsArray,
      notes: notes || null,
      isActive: typeof isActive === "boolean" ? isActive : true
    }
  })

  res.status(201).json(route)
})

// @desc    Update user route
// @route   PUT /api/users/routes/:id
// @access  Private
export const updateUserRoute = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { title, description, placeIds, notes, isActive } = req.body

  const existing = await prisma.userRoute.findFirst({
    where: {
      id,
      userId: req.user.id
    }
  })

  if (!existing) {
    res.status(404)
    throw new Error("Маршрут не найден")
  }

  const data = {}

  if (typeof title !== "undefined") {
    if (!title || typeof title !== "string" || !title.trim()) {
      res.status(400)
      throw new Error("Название маршрута обязательно")
    }
    data.title = title.trim()
  }

  if (typeof description !== "undefined") {
    data.description = description || null
  }

  if (typeof placeIds !== "undefined") {
    data.placeIds = Array.isArray(placeIds) ? placeIds.filter(Boolean) : []
  }

  if (typeof notes !== "undefined") {
    data.notes = notes || null
  }

  if (typeof isActive !== "undefined") {
    data.isActive = !!isActive
  }

  const updated = await prisma.userRoute.update({
    where: { id: existing.id },
    data
  })

  res.json(updated)
})

// @desc    Delete user route
// @route   DELETE /api/users/routes/:id
// @access  Private
export const deleteUserRoute = asyncHandler(async (req, res) => {
  const { id } = req.params

  const existing = await prisma.userRoute.findFirst({
    where: {
      id,
      userId: req.user.id
    }
  })

  if (!existing) {
    res.status(404)
    throw new Error("Маршрут не найден")
  }

  await prisma.userRoute.delete({
    where: { id: existing.id }
  })

  res.json({ success: true })
})
