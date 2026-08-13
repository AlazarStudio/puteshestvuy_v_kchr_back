import dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../app/prisma.js'

// Замены значений фильтра «Доступность» у мест.
// Слева — то, что реально лежит в базе, справа — значение из справочника
// PlaceFilterConfig. Значения вне справочника недостижимы через фильтр сайта,
// поэтому места с ними молча выпадают из выдачи.
//
// «только пешком» → «Пешком» — слияние по смыслу, а не по регистру: справочник
// оттенка «только» не знает, а в данных это значение и без нас соседствует
// с «на машине», то есть противоречие уже записано. Слияние его убирает.
const ACCESSIBILITY_MAP = {
  'на машине': 'На машине',
  'только пешком': 'Пешком',
}

/** Заменяет значения по таблице и убирает дубли, сохраняя порядок первого вхождения */
function normalize(values, map) {
  const seen = new Set()
  const result = []
  for (const value of values || []) {
    const next = map[value] ?? value
    if (seen.has(next)) continue
    seen.add(next)
    result.push(next)
  }
  return result
}

const sameArray = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

async function normalizePlaceFilters({ apply }) {
  console.log(apply ? 'Режим: ЗАПИСЬ' : 'Режим: сухой прогон, база не меняется')
  console.log('')

  const dirtyValues = Object.keys(ACCESSIBILITY_MAP)
  const places = await prisma.place.findMany({
    where: { OR: dirtyValues.map((value) => ({ accessibility: { has: value } })) },
    select: { id: true, title: true, accessibility: true },
  })

  console.log(`Найдено записей с ненормализованными значениями: ${places.length}`)
  console.log('')

  let changed = 0

  for (const place of places) {
    const before = place.accessibility || []
    const after = normalize(before, ACCESSIBILITY_MAP)

    if (sameArray(before, after)) continue

    changed++
    console.log(`${place.title}`)
    console.log(`   было:  ${JSON.stringify(before)}`)
    console.log(`   стало: ${JSON.stringify(after)}`)

    if (apply) {
      await prisma.place.update({
        where: { id: place.id },
        data: { accessibility: after },
      })
    }
  }

  console.log('')
  if (!changed) {
    console.log('Менять нечего, данные уже нормализованы.')
  } else if (apply) {
    console.log(`Обновлено записей: ${changed}`)
  } else {
    console.log(`Будет обновлено записей: ${changed}`)
    console.log('Запустить с флагом --apply, чтобы записать изменения.')
  }
}

normalizePlaceFilters({ apply: process.argv.includes('--apply') })
  .catch((e) => {
    console.error('Ошибка:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
