import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

const DEFAULT_CONFIG = {
  id: 'default',
  directions: ['Архыз', 'Домбай', 'Джылы-Суу', 'Медовые водопады'],
  seasons: ['зима', 'весна', 'лето', 'осень'],
  objectTypes: ['заповедник', 'горы', 'озера/реки', 'ледники', 'водопады', 'ущелья', 'пещеры'],
  accessibility: ['только пешком', 'на машине'],
}

const FIXED_GROUP_KEYS = ['directions', 'seasons', 'objectTypes', 'accessibility']

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
  const extraGroups = getExtraGroupsFromConfig(config)
  const fixedGroupMeta = config.fixedGroupMeta && typeof config.fixedGroupMeta === 'object' ? config.fixedGroupMeta : {}
  const hiddenFixedGroups = Array.isArray(config.hiddenFixedGroups) ? config.hiddenFixedGroups : []
  res.json({ ...config, extraGroups, fixedGroupMeta, hiddenFixedGroups })
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

// @desc    Update place filters config (full replace)
// @route   PUT /api/admin/place-filters
export const updatePlaceFilters = asyncHandler(async (req, res) => {
  const extraGroups = normalizeExtraGroups(req.body.extraGroups)
  const fixedGroupMeta = normalizeFixedGroupMeta(req.body.fixedGroupMeta)
  const hiddenFixedGroups = Array.isArray(req.body.hiddenFixedGroups)
    ? req.body.hiddenFixedGroups.filter((k) => typeof k === 'string' && FIXED_GROUP_KEYS.includes(k.trim()))
    : undefined
  const data = {
    directions: ensureArray(req.body.directions),
    seasons: ensureArray(req.body.seasons),
    objectTypes: ensureArray(req.body.objectTypes),
    accessibility: ensureArray(req.body.accessibility),
    extraGroups: extraGroups.length ? extraGroups : null,
    ...(req.body.fixedGroupMeta !== undefined && { fixedGroupMeta: Object.keys(fixedGroupMeta).length ? fixedGroupMeta : null }),
    ...(hiddenFixedGroups !== undefined && { hiddenFixedGroups }),
  }
  const config = await prisma.placeFilterConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...data },
    update: data,
  })
  const out = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({
    ...out,
    extraGroups: getExtraGroupsFromConfig(out),
    fixedGroupMeta: out.fixedGroupMeta && typeof out.fixedGroupMeta === 'object' ? out.fixedGroupMeta : {},
    hiddenFixedGroups: Array.isArray(out.hiddenFixedGroups) ? out.hiddenFixedGroups : [],
  })
})

// @desc    Add new filter group (key генерируется из label)
// @route   POST /api/admin/place-filters/add-group
export const addPlaceFilterGroup = asyncHandler(async (req, res) => {
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

  const config = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
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
  await prisma.placeFilterConfig.update({
    where: { id: 'default' },
    data: { extraGroups: newExtra },
  })
  const updated = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({
    ...updated,
    extraGroups: newExtra,
    fixedGroupMeta: updated.fixedGroupMeta && typeof updated.fixedGroupMeta === 'object' ? updated.fixedGroupMeta : {},
    hiddenFixedGroups: Array.isArray(updated.hiddenFixedGroups) ? updated.hiddenFixedGroups : [],
  })
})

// @desc    Remove filter group (extra или встроенная — встроенная скрывается и очищается)
// @route   POST /api/admin/place-filters/remove-group
export const removePlaceFilterGroup = asyncHandler(async (req, res) => {
  const key = typeof req.body.key === 'string' ? req.body.key.trim() : ''
  if (!key) {
    res.status(400)
    throw new Error('Укажите ключ группы')
  }

  const config = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  if (!config) {
    res.status(404)
    throw new Error('Конфигурация фильтров не найдена')
  }

  if (FIXED_GROUP_KEYS.includes(key)) {
    const hidden = Array.isArray(config.hiddenFixedGroups) ? [...config.hiddenFixedGroups] : []
    if (!hidden.includes(key)) hidden.push(key)
    await prisma.placeFilterConfig.update({
      where: { id: 'default' },
      data: { hiddenFixedGroups: hidden, [key]: [] },
    })
    const updated = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
    return res.json({
      ...updated,
      extraGroups: getExtraGroupsFromConfig(updated),
      fixedGroupMeta: updated.fixedGroupMeta && typeof updated.fixedGroupMeta === 'object' ? updated.fixedGroupMeta : {},
      hiddenFixedGroups: Array.isArray(updated.hiddenFixedGroups) ? updated.hiddenFixedGroups : [],
    })
  }

  const extra = getExtraGroupsFromConfig(config).filter((g) => g.key !== key)
  await prisma.placeFilterConfig.update({
    where: { id: 'default' },
    data: { extraGroups: extra.length ? extra : null },
  })

  const places = await prisma.place.findMany({ select: { id: true, customFilters: true } })
  for (const place of places) {
    const cf = place.customFilters && typeof place.customFilters === 'object' ? { ...place.customFilters } : {}
    if (key in cf) {
      delete cf[key]
      await prisma.place.update({
        where: { id: place.id },
        data: { customFilters: Object.keys(cf).length ? cf : null },
      })
    }
  }

  const updated = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({
    ...updated,
    extraGroups: extra,
    fixedGroupMeta: updated.fixedGroupMeta && typeof updated.fixedGroupMeta === 'object' ? updated.fixedGroupMeta : {},
    hiddenFixedGroups: Array.isArray(updated.hiddenFixedGroups) ? updated.hiddenFixedGroups : [],
  })
})

// @desc    Update one group meta (label, icon, iconType)
// @route   PATCH /api/admin/place-filters/group-meta
export const updatePlaceFilterGroupMeta = asyncHandler(async (req, res) => {
  const key = typeof req.body.key === 'string' ? req.body.key.trim() : ''
  if (!key) {
    res.status(400)
    throw new Error('Укажите ключ группы')
  }

  const label = req.body.label !== undefined ? (typeof req.body.label === 'string' ? req.body.label.trim() : null) : undefined
  const icon = req.body.icon !== undefined ? (typeof req.body.icon === 'string' && req.body.icon.trim() ? req.body.icon.trim() : null) : undefined
  const iconType = req.body.iconType === 'upload' || req.body.iconType === 'library' ? req.body.iconType : req.body.iconType === null ? null : undefined

  const config = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
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
    await prisma.placeFilterConfig.update({
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
    await prisma.placeFilterConfig.update({
      where: { id: 'default' },
      data: { extraGroups: extra },
    })
  }

  const updated = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({
    ...updated,
    extraGroups: getExtraGroupsFromConfig(updated),
    fixedGroupMeta: updated.fixedGroupMeta && typeof updated.fixedGroupMeta === 'object' ? updated.fixedGroupMeta : {},
    hiddenFixedGroups: Array.isArray(updated.hiddenFixedGroups) ? updated.hiddenFixedGroups : [],
  })
})

// @desc    Replace one value in a group (rename) — update config and all places
// @route   POST /api/admin/place-filters/replace-value
export const replaceFilterValue = asyncHandler(async (req, res) => {
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

  const config = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
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
    await prisma.placeFilterConfig.update({
      where: { id: 'default' },
      data: { [group]: arr },
    })
    const places = await prisma.place.findMany({ select: { id: true, [group]: true } })
    for (const place of places) {
      const current = place[group] || []
      if (current.includes(oldValue)) {
        await prisma.place.update({
          where: { id: place.id },
          data: { [group]: current.map((v) => (v === oldValue ? trimmedNew : v)) },
        })
      }
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
    await prisma.placeFilterConfig.update({
      where: { id: 'default' },
      data: { extraGroups: extra },
    })
    const places = await prisma.place.findMany({ select: { id: true, customFilters: true } })
    for (const place of places) {
      const cf = place.customFilters && typeof place.customFilters === 'object' ? { ...place.customFilters } : {}
      const arr = Array.isArray(cf[group]) ? cf[group] : []
      if (arr.includes(oldValue)) {
        cf[group] = arr.map((v) => (v === oldValue ? trimmedNew : v))
        await prisma.place.update({
          where: { id: place.id },
          data: { customFilters: cf },
        })
      }
    }
  }

  const updated = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({ ...updated, extraGroups: getExtraGroupsFromConfig(updated) })
})

// @desc    Remove one value from a group — update config and remove from all places
// @route   POST /api/admin/place-filters/remove-value
export const removeFilterValue = asyncHandler(async (req, res) => {
  const { group, value } = req.body
  if (!group || value == null || typeof value !== 'string') {
    res.status(400)
    throw new Error('Нужны group и value')
  }

  const config = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  if (!config) {
    res.status(404)
    throw new Error('Конфигурация фильтров не найдена')
  }

  if (FIXED_GROUP_KEYS.includes(group)) {
    const arr = (config[group] || []).filter((v) => v !== value)
    await prisma.placeFilterConfig.update({
      where: { id: 'default' },
      data: { [group]: arr },
    })
    const places = await prisma.place.findMany({ select: { id: true, [group]: true } })
    for (const place of places) {
      const current = place[group] || []
      if (current.includes(value)) {
        await prisma.place.update({
          where: { id: place.id },
          data: { [group]: current.filter((v) => v !== value) },
        })
      }
    }
  } else {
    const extra = getExtraGroupsFromConfig(config)
    const idx = extra.findIndex((g) => g.key === group)
    if (idx === -1) {
      res.status(404)
      throw new Error('Группа не найдена')
    }
    extra[idx] = { ...extra[idx], values: (extra[idx].values || []).filter((v) => v !== value) }
    await prisma.placeFilterConfig.update({
      where: { id: 'default' },
      data: { extraGroups: extra },
    })
    const places = await prisma.place.findMany({ select: { id: true, customFilters: true } })
    for (const place of places) {
      const cf = place.customFilters && typeof place.customFilters === 'object' ? { ...place.customFilters } : {}
      if (!Array.isArray(cf[group])) continue
      const arr = cf[group].filter((v) => v !== value)
      if (arr.length === cf[group].length) continue
      if (arr.length === 0) delete cf[group]
      else cf[group] = arr
      await prisma.place.update({
        where: { id: place.id },
        data: { customFilters: Object.keys(cf).length ? cf : null },
      })
    }
  }

  const updated = await prisma.placeFilterConfig.findUnique({ where: { id: 'default' } })
  res.json({ ...updated, extraGroups: getExtraGroupsFromConfig(updated) })
})
