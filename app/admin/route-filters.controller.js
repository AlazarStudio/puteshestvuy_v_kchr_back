import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

const DEFAULT_CONFIG = {
  id: 'default',
  seasons: ['Зима', 'Весна', 'Лето', 'Осень'],
  transport: ['Пешком', 'Верхом', 'Автомобиль', 'Квадроцикл'],
  durationOptions: ['Полдня', '1 день', '2 дня', '3ч 30м', '5 дней'],
  difficultyLevels: ['1', '2', '3', '4', '5'],
  distanceOptions: ['до 10 км', '10–50 км', '50–100 км', '100+ км'],
  elevationOptions: ['до 500 м', '500–1000 м', '1000+ м'],
  isFamilyOptions: ['Да'],
  hasOvernightOptions: ['Да'],
}

const FIXED_GROUP_KEYS = ['seasons', 'transport', 'durationOptions', 'difficultyLevels', 'distanceOptions', 'elevationOptions', 'isFamilyOptions', 'hasOvernightOptions']

function ensureArray(val) {
  return Array.isArray(val) ? val.filter((v) => typeof v === 'string' && v.trim()) : []
}

function normalizeExtraGroups(val) {
  if (!Array.isArray(val)) return []
  return val
    .filter((g) => g && typeof g.key === 'string' && g.key.trim())
    .map((g) => ({
      key: String(g.key).trim().replace(/\s+/g, '_'),
      label: typeof g.label === 'string' ? g.label.trim() || g.key : String(g.key),
      values: ensureArray(g.values),
    }))
}

function getExtraGroupsFromConfig(config) {
  const raw = config?.extraGroups
  return normalizeExtraGroups(Array.isArray(raw) ? raw : raw ? [raw] : [])
}

// @desc    Get route filters config
// @route   GET /api/admin/route-filters
export const getRouteFilters = asyncHandler(async (req, res) => {
  let config = await prisma.routeFilterConfig.findUnique({
    where: { id: 'default' },
  })
  if (!config) {
    config = await prisma.routeFilterConfig.create({
      data: {
        id: 'default',
        seasons: DEFAULT_CONFIG.seasons,
        transport: DEFAULT_CONFIG.transport,
        durationOptions: DEFAULT_CONFIG.durationOptions,
        difficultyLevels: DEFAULT_CONFIG.difficultyLevels,
        distanceOptions: DEFAULT_CONFIG.distanceOptions,
        elevationOptions: DEFAULT_CONFIG.elevationOptions,
        isFamilyOptions: DEFAULT_CONFIG.isFamilyOptions,
        hasOvernightOptions: DEFAULT_CONFIG.hasOvernightOptions,
      },
    })
  }
  const extraGroups = getExtraGroupsFromConfig(config)
  const payload = {
    ...config,
    seasons: Array.isArray(config.seasons) ? config.seasons : DEFAULT_CONFIG.seasons,
    transport: Array.isArray(config.transport) ? config.transport : DEFAULT_CONFIG.transport,
    durationOptions: Array.isArray(config.durationOptions) ? config.durationOptions : DEFAULT_CONFIG.durationOptions,
    difficultyLevels: Array.isArray(config.difficultyLevels) ? config.difficultyLevels : DEFAULT_CONFIG.difficultyLevels,
    distanceOptions: Array.isArray(config.distanceOptions) ? config.distanceOptions : DEFAULT_CONFIG.distanceOptions,
    elevationOptions: Array.isArray(config.elevationOptions) ? config.elevationOptions : DEFAULT_CONFIG.elevationOptions,
    isFamilyOptions: Array.isArray(config.isFamilyOptions) ? config.isFamilyOptions : DEFAULT_CONFIG.isFamilyOptions,
    hasOvernightOptions: Array.isArray(config.hasOvernightOptions) ? config.hasOvernightOptions : DEFAULT_CONFIG.hasOvernightOptions,
    extraGroups,
  }
  res.json(payload)
})

// @desc    Update route filters config (full replace)
// @route   PUT /api/admin/route-filters
export const updateRouteFilters = asyncHandler(async (req, res) => {
  const extraGroups = normalizeExtraGroups(req.body.extraGroups)
  const data = {
    seasons: ensureArray(req.body.seasons),
    transport: ensureArray(req.body.transport),
    durationOptions: ensureArray(req.body.durationOptions),
    difficultyLevels: ensureArray(req.body.difficultyLevels),
    distanceOptions: ensureArray(req.body.distanceOptions),
    elevationOptions: ensureArray(req.body.elevationOptions),
    isFamilyOptions: ensureArray(req.body.isFamilyOptions),
    hasOvernightOptions: ensureArray(req.body.hasOvernightOptions),
    extraGroups: extraGroups.length ? extraGroups : null,
  }
  const config = await prisma.routeFilterConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...data },
    update: data,
  })
  res.json({ ...config, extraGroups: getExtraGroupsFromConfig(config) })
})

// @desc    Add new filter group
// @route   POST /api/admin/route-filters/add-group
export const addRouteFilterGroup = asyncHandler(async (req, res) => {
  const key = typeof req.body.key === 'string' ? req.body.key.trim().replace(/\s+/g, '_') : ''
  const label = typeof req.body.label === 'string' ? req.body.label.trim() : key
  if (!key) {
    res.status(400)
    throw new Error('Укажите ключ группы (латиница/цифры/подчёркивание)')
  }
  if (FIXED_GROUP_KEYS.includes(key)) {
    res.status(400)
    throw new Error('Такой ключ уже используется встроенной группой')
  }

  const config = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  if (!config) {
    res.status(404)
    throw new Error('Конфигурация фильтров не найдена')
  }
  const extra = getExtraGroupsFromConfig(config)
  if (extra.some((g) => g.key === key)) {
    res.status(400)
    throw new Error('Группа с таким ключом уже есть')
  }
  const values = ensureArray(req.body.values)
  const newExtra = [...extra, { key, label, values }]
  await prisma.routeFilterConfig.update({
    where: { id: 'default' },
    data: { extraGroups: newExtra },
  })
  const updated = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({ ...updated, extraGroups: newExtra })
})

// @desc    Remove filter group (extra only)
// @route   POST /api/admin/route-filters/remove-group
export const removeRouteFilterGroup = asyncHandler(async (req, res) => {
  const key = typeof req.body.key === 'string' ? req.body.key.trim() : ''
  if (!key || FIXED_GROUP_KEYS.includes(key)) {
    res.status(400)
    throw new Error('Нельзя удалить встроенную группу или ключ не указан')
  }

  const config = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  if (!config) {
    res.status(404)
    throw new Error('Конфигурация фильтров не найдена')
  }
  const extra = getExtraGroupsFromConfig(config).filter((g) => g.key !== key)
  await prisma.routeFilterConfig.update({
    where: { id: 'default' },
    data: { extraGroups: extra.length ? extra : null },
  })

  const routes = await prisma.route.findMany({ select: { id: true, customFilters: true } })
  for (const route of routes) {
    const cf = route.customFilters && typeof route.customFilters === 'object' ? { ...route.customFilters } : {}
    if (key in cf) {
      delete cf[key]
      await prisma.route.update({
        where: { id: route.id },
        data: { customFilters: Object.keys(cf).length ? cf : null },
      })
    }
  }

  const updated = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({ ...updated, extraGroups: extra })
})

// @desc    Replace one value in a group — update config and all routes
// @route   POST /api/admin/route-filters/replace-value
export const replaceRouteFilterValue = asyncHandler(async (req, res) => {
  const { group, oldValue, newValue } = req.body
  if (!group || !oldValue || !newValue || typeof oldValue !== 'string' || typeof newValue !== 'string') {
    res.status(400)
    throw new Error('Нужны group, oldValue и newValue')
  }
  const trimmedNew = newValue.trim()
  if (!trimmedNew) {
    res.status(400)
    throw new Error('Новое значение не может быть пустым')
  }

  const config = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  if (!config) {
    res.status(404)
    throw new Error('Конфигурация фильтров не найдена')
  }

  if (FIXED_GROUP_KEYS.includes(group)) {
    const arr = [...(config[group] || [])]
    const idx = arr.indexOf(oldValue)
    if (idx === -1) {
      res.status(404)
      throw new Error('Значение не найдено в группе')
    }
    arr[idx] = trimmedNew
    await prisma.routeFilterConfig.update({
      where: { id: 'default' },
      data: { [group]: arr },
    })
    // Обновлять маршруты только для seasons/transport (у Route есть эти поля)
    if (group === 'seasons' || group === 'transport') {
      await prisma.route.updateMany({
        where: { [group]: oldValue },
        data: { [group]: trimmedNew },
      })
    }
  } else {
    const extra = getExtraGroupsFromConfig(config)
    const idx = extra.findIndex((g) => g.key === group)
    if (idx === -1) {
      res.status(404)
      throw new Error('Группа не найдена')
    }
    const values = [...extra[idx].values]
    const vi = values.indexOf(oldValue)
    if (vi === -1) {
      res.status(404)
      throw new Error('Значение не найдено в группе')
    }
    values[vi] = trimmedNew
    extra[idx] = { ...extra[idx], values }
    await prisma.routeFilterConfig.update({
      where: { id: 'default' },
      data: { extraGroups: extra },
    })
    const routes = await prisma.route.findMany({ select: { id: true, customFilters: true } })
    for (const route of routes) {
      const cf = route.customFilters && typeof route.customFilters === 'object' ? { ...route.customFilters } : {}
      const arr = Array.isArray(cf[group]) ? cf[group] : []
      if (arr.includes(oldValue)) {
        cf[group] = arr.map((v) => (v === oldValue ? trimmedNew : v))
        await prisma.route.update({
          where: { id: route.id },
          data: { customFilters: cf },
        })
      }
    }
  }

  const updated = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({ ...updated, extraGroups: getExtraGroupsFromConfig(updated) })
})

// @desc    Remove one value from a group
// @route   POST /api/admin/route-filters/remove-value
export const removeRouteFilterValue = asyncHandler(async (req, res) => {
  const { group, value } = req.body
  if (!group || value == null || typeof value !== 'string') {
    res.status(400)
    throw new Error('Нужны group и value')
  }

  const config = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  if (!config) {
    res.status(404)
    throw new Error('Конфигурация фильтров не найдена')
  }

  if (FIXED_GROUP_KEYS.includes(group)) {
    const arr = (config[group] || []).filter((v) => v !== value)
    await prisma.routeFilterConfig.update({
      where: { id: 'default' },
      data: { [group]: arr },
    })
    if (group === 'seasons' || group === 'transport') {
      await prisma.route.updateMany({
        where: { [group]: value },
        data: { [group]: null },
      })
    }
  } else {
    const extra = getExtraGroupsFromConfig(config)
    const idx = extra.findIndex((g) => g.key === group)
    if (idx === -1) {
      res.status(404)
      throw new Error('Группа не найдена')
    }
    extra[idx] = { ...extra[idx], values: (extra[idx].values || []).filter((v) => v !== value) }
    await prisma.routeFilterConfig.update({
      where: { id: 'default' },
      data: { extraGroups: extra },
    })
    const routes = await prisma.route.findMany({ select: { id: true, customFilters: true } })
    for (const route of routes) {
      const cf = route.customFilters && typeof route.customFilters === 'object' ? { ...route.customFilters } : {}
      if (!Array.isArray(cf[group])) continue
      const arr = cf[group].filter((v) => v !== value)
      if (arr.length === cf[group].length) continue
      if (arr.length === 0) delete cf[group]
      else cf[group] = arr
      await prisma.route.update({
        where: { id: route.id },
        data: { customFilters: Object.keys(cf).length ? cf : null },
      })
    }
  }

  const updated = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({ ...updated, extraGroups: getExtraGroupsFromConfig(updated) })
})
