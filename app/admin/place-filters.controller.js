import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

const DEFAULT_CONFIG = {
  id: 'default',
  directions: ['Архыз', 'Домбай', 'Джылы-Суу', 'Медовые водопады'],
  seasons: ['зима', 'весна', 'лето', 'осень'],
  objectTypes: ['заповедник', 'горы', 'озера/реки', 'ледники', 'водопады', 'ущелья', 'пещеры'],
  accessibility: ['только пешком', 'на машине'],
}

const GROUP_KEYS = ['directions', 'seasons', 'objectTypes', 'accessibility']

function ensureArray(val) {
  return Array.isArray(val) ? val.filter((v) => typeof v === 'string' && v.trim()) : []
}

// @desc    Get place filters config
// @route   GET /api/admin/place-filters
export const getPlaceFilters = asyncHandler(async (req, res) => {
  let config = await prisma.placeFilterConfig.findUnique({
    where: { id: 'default' },
  })
  if (!config) {
    config = await prisma.placeFilterConfig.create({
      data: {
        id: 'default',
        directions: DEFAULT_CONFIG.directions,
        seasons: DEFAULT_CONFIG.seasons,
        objectTypes: DEFAULT_CONFIG.objectTypes,
        accessibility: DEFAULT_CONFIG.accessibility,
      },
    })
  }
  res.json(config)
})

// @desc    Update place filters config (full replace)
// @route   PUT /api/admin/place-filters
export const updatePlaceFilters = asyncHandler(async (req, res) => {
  const data = {
    directions: ensureArray(req.body.directions),
    seasons: ensureArray(req.body.seasons),
    objectTypes: ensureArray(req.body.objectTypes),
    accessibility: ensureArray(req.body.accessibility),
  }
  const config = await prisma.placeFilterConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...data },
    update: data,
  })
  res.json(config)
})

// @desc    Replace one value in a group (rename) — update config and all places
// @route   POST /api/admin/place-filters/replace-value
export const replaceFilterValue = asyncHandler(async (req, res) => {
  const { group, oldValue, newValue } = req.body
  if (!group || !GROUP_KEYS.includes(group) || !oldValue || !newValue || typeof oldValue !== 'string' || typeof newValue !== 'string') {
    res.status(400)
    throw new Error('Нужны group, oldValue и newValue')
  }
  const trimmedNew = newValue.trim()
  if (!trimmedNew) {
    res.status(400)
    throw new Error('Новое значение не может быть пустым')
  }

  const config = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  if (!config) {
    res.status(404)
    throw new Error('Конфигурация фильтров не найдена')
  }
  const arr = [...(config[group] || [])]
  const idx = arr.indexOf(oldValue)
  if (idx === -1) {
    res.status(404)
    throw new Error('Значение не найдено в группе')
  }
  arr[idx] = trimmedNew
  await prisma.placeFilterConfig.update({
    where: { id: 'default' },
    data: { [group]: arr },
  })

  // Обновить все места: в массиве group заменить oldValue на newValue
  const places = await prisma.place.findMany({ select: { id: true, [group]: true } })
  for (const place of places) {
    const current = place[group] || []
    if (current.includes(oldValue)) {
      const updated = current.map((v) => (v === oldValue ? trimmedNew : v))
      await prisma.place.update({
        where: { id: place.id },
        data: { [group]: updated },
      })
    }
  }

  const updated = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json(updated)
})

// @desc    Remove one value from a group — update config and remove from all places
// @route   POST /api/admin/place-filters/remove-value
export const removeFilterValue = asyncHandler(async (req, res) => {
  const { group, value } = req.body
  if (!group || !GROUP_KEYS.includes(group) || value == null || typeof value !== 'string') {
    res.status(400)
    throw new Error('Нужны group и value')
  }

  const config = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  if (!config) {
    res.status(404)
    throw new Error('Конфигурация фильтров не найдена')
  }
  const arr = (config[group] || []).filter((v) => v !== value)
  await prisma.placeFilterConfig.update({
    where: { id: 'default' },
    data: { [group]: arr },
  })

  // Удалить значение из всех мест
  const places = await prisma.place.findMany({ select: { id: true, [group]: true } })
  for (const place of places) {
    const current = place[group] || []
    if (current.includes(value)) {
      const updated = current.filter((v) => v !== value)
      await prisma.place.update({
        where: { id: place.id },
        data: { [group]: updated },
      })
    }
  }

  const updated = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json(updated)
})
