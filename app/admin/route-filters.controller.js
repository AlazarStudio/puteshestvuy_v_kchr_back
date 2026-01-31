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

/** Транслитерация кириллицы в латиницу для генерации ключа из названия */
const CYR_TO_LAT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
function slugFromLabel(label) {
  if (!label || typeof label !== 'string') return ''
  const s = label.trim().toLowerCase()
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (CYR_TO_LAT[c]) out += CYR_TO_LAT[c]
    else if (/[a-z0-9]/.test(c)) out += c
    else if (/\s/.test(c)) out += '_'
    else if (c === '_') out += '_'
  }
  return out.replace(/_+/g, '_').replace(/^_|_$/g, '') || 'group'
}

function normalizeExtraGroups(val) {
  if (!Array.isArray(val)) return []
  return val
    .filter((g) => g && typeof g.key === 'string' && g.key.trim())
    .map((g) => {
      const iconType = g.iconType === 'upload' || g.iconType === 'library' ? g.iconType : (g.icon && (g.icon.startsWith('http') || g.icon.startsWith('/')) ? 'upload' : 'library')
      return {
        key: String(g.key).trim().replace(/\s+/g, '_'),
        label: typeof g.label === 'string' ? g.label.trim() || g.key : String(g.key),
        icon: typeof g.icon === 'string' && g.icon.trim() ? g.icon.trim() : null,
        iconType: iconType,
        values: ensureArray(g.values),
      }
    })
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
  const fixedGroupMeta = config.fixedGroupMeta && typeof config.fixedGroupMeta === 'object' ? config.fixedGroupMeta : {}
  const hiddenFixedGroups = Array.isArray(config.hiddenFixedGroups) ? config.hiddenFixedGroups : []
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
    fixedGroupMeta,
    hiddenFixedGroups,
  }
  res.json(payload)
})

function normalizeFixedGroupMeta(val) {
  if (!val || typeof val !== 'object') return {}
  const out = {}
  for (const key of FIXED_GROUP_KEYS) {
    const m = val[key]
    if (!m || typeof m !== 'object') continue
    out[key] = {
      label: typeof m.label === 'string' && m.label.trim() ? m.label.trim() : null,
      icon: typeof m.icon === 'string' && m.icon.trim() ? m.icon.trim() : null,
      iconType: m.iconType === 'upload' || m.iconType === 'library' ? m.iconType : null,
    }
  }
  return out
}

// @desc    Update route filters config (full replace)
// @route   PUT /api/admin/route-filters
export const updateRouteFilters = asyncHandler(async (req, res) => {
  const extraGroups = normalizeExtraGroups(req.body.extraGroups)
  const fixedGroupMeta = normalizeFixedGroupMeta(req.body.fixedGroupMeta)
  const hiddenFixedGroups = Array.isArray(req.body.hiddenFixedGroups)
    ? req.body.hiddenFixedGroups.filter((k) => typeof k === 'string' && FIXED_GROUP_KEYS.includes(k.trim()))
    : undefined
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
    ...(req.body.fixedGroupMeta !== undefined && { fixedGroupMeta: Object.keys(fixedGroupMeta).length ? fixedGroupMeta : null }),
    ...(hiddenFixedGroups !== undefined && { hiddenFixedGroups }),
  }
  const config = await prisma.routeFilterConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...data },
    update: data,
  })
  const out = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({
    ...out,
    extraGroups: getExtraGroupsFromConfig(out),
    fixedGroupMeta: out.fixedGroupMeta && typeof out.fixedGroupMeta === 'object' ? out.fixedGroupMeta : {},
    hiddenFixedGroups: Array.isArray(out.hiddenFixedGroups) ? out.hiddenFixedGroups : [],
  })
})

// @desc    Add new filter group (key генерируется из label, если не передан)
// @route   POST /api/admin/route-filters/add-group
export const addRouteFilterGroup = asyncHandler(async (req, res) => {
  const label = typeof req.body.label === 'string' ? req.body.label.trim() : ''
  if (!label) {
    res.status(400)
    throw new Error('Укажите название группы')
  }
  let key = typeof req.body.key === 'string' ? req.body.key.trim().replace(/\s+/g, '_') : ''
  if (!key) key = slugFromLabel(label)
  if (!key) key = 'group'
  const icon = typeof req.body.icon === 'string' && req.body.icon.trim() ? req.body.icon.trim() : null
  const iconType = req.body.iconType === 'upload' || req.body.iconType === 'library' ? req.body.iconType : (icon && (icon.startsWith('http') || icon.startsWith('/')) ? 'upload' : 'library')

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
  const newExtra = [...extra, { key, label, icon, iconType, values }]
  await prisma.routeFilterConfig.update({
    where: { id: 'default' },
    data: { extraGroups: newExtra },
  })
  const updated = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({ ...updated, extraGroups: newExtra })
})

// @desc    Remove filter group (extra или встроенная — встроенная скрывается и очищается)
// @route   POST /api/admin/route-filters/remove-group
export const removeRouteFilterGroup = asyncHandler(async (req, res) => {
  const key = typeof req.body.key === 'string' ? req.body.key.trim() : ''
  if (!key) {
    res.status(400)
    throw new Error('Укажите ключ группы')
  }

  const config = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  if (!config) {
    res.status(404)
    throw new Error('Конфигурация фильтров не найдена')
  }

  if (FIXED_GROUP_KEYS.includes(key)) {
    const hidden = Array.isArray(config.hiddenFixedGroups) ? [...config.hiddenFixedGroups] : []
    if (!hidden.includes(key)) hidden.push(key)
    const updateData = {
      hiddenFixedGroups: hidden,
      [key]: [],
    }
    await prisma.routeFilterConfig.update({
      where: { id: 'default' },
      data: updateData,
    })
    const updated = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
    return res.json({
      ...updated,
      extraGroups: getExtraGroupsFromConfig(updated),
      fixedGroupMeta: updated.fixedGroupMeta && typeof updated.fixedGroupMeta === 'object' ? updated.fixedGroupMeta : {},
      hiddenFixedGroups: Array.isArray(updated.hiddenFixedGroups) ? updated.hiddenFixedGroups : [],
    })
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
  res.json({
    ...updated,
    extraGroups: extra,
    fixedGroupMeta: updated.fixedGroupMeta && typeof updated.fixedGroupMeta === 'object' ? updated.fixedGroupMeta : {},
    hiddenFixedGroups: Array.isArray(updated.hiddenFixedGroups) ? updated.hiddenFixedGroups : [],
  })
})

// @desc    Update one group meta (label, icon, iconType) — встроенная или пользовательская
// @route   PATCH /api/admin/route-filters/group-meta
export const updateRouteFilterGroupMeta = asyncHandler(async (req, res) => {
  const key = typeof req.body.key === 'string' ? req.body.key.trim() : ''
  if (!key) {
    res.status(400)
    throw new Error('Укажите ключ группы')
  }

  const label = req.body.label !== undefined ? (typeof req.body.label === 'string' ? req.body.label.trim() : null) : undefined
  const icon = req.body.icon !== undefined ? (typeof req.body.icon === 'string' && req.body.icon.trim() ? req.body.icon.trim() : null) : undefined
  const iconType = req.body.iconType === 'upload' || req.body.iconType === 'library' ? req.body.iconType : req.body.iconType === null ? null : undefined

  const config = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  if (!config) {
    res.status(404)
    throw new Error('Конфигурация фильтров не найдена')
  }

  if (FIXED_GROUP_KEYS.includes(key)) {
    const currentMeta = config.fixedGroupMeta && typeof config.fixedGroupMeta === 'object' ? config.fixedGroupMeta : {}
    const meta = { ...(currentMeta[key] && typeof currentMeta[key] === 'object' ? currentMeta[key] : {}) }
    if (label !== undefined) meta.label = label
    if (icon !== undefined) meta.icon = icon
    if (iconType !== undefined) meta.iconType = iconType
    const fixedGroupMeta = { ...currentMeta, [key]: meta }
    await prisma.routeFilterConfig.update({
      where: { id: 'default' },
      data: { fixedGroupMeta: Object.keys(fixedGroupMeta).length ? fixedGroupMeta : null },
    })
  } else {
    const extra = getExtraGroupsFromConfig(config)
    const idx = extra.findIndex((g) => g.key === key)
    if (idx === -1) {
      res.status(404)
      throw new Error('Группа не найдена')
    }
    const g = { ...extra[idx] }
    if (label !== undefined) g.label = label
    if (icon !== undefined) g.icon = icon
    if (iconType !== undefined) g.iconType = iconType
    extra[idx] = g
    await prisma.routeFilterConfig.update({
      where: { id: 'default' },
      data: { extraGroups: extra },
    })
  }

  const updated = await prisma.routeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({
    ...updated,
    extraGroups: getExtraGroupsFromConfig(updated),
    fixedGroupMeta: updated.fixedGroupMeta && typeof updated.fixedGroupMeta === 'object' ? updated.fixedGroupMeta : {},
    hiddenFixedGroups: Array.isArray(updated.hiddenFixedGroups) ? updated.hiddenFixedGroups : [],
  })
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
