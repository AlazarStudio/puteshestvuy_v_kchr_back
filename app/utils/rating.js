import { prisma } from "../prisma.js"

/**
 * Коллекция Mongo по типу сущности из отзыва.
 * Имена нативные, потому что запись идёт сырой командой — см. комментарий к updateEntityRating.
 * При переименовании моделей или @@map в schema.prisma править здесь же: связи через Prisma нет,
 * и расхождение проявится не ошибкой, а тихо переставшим обновляться рейтингом.
 */
const collectionByEntityType = {
  place: "places",
  route: "routes",
  service: "services",
}

/**
 * Пересчёт по одобренным отзывам.
 * reviewsCount обновляется всегда, rating — только когда объект не в ручном режиме.
 *
 * Режим проверяется фильтром самой записи, а не отдельным чтением заранее: иначе между
 * «прочитали reviews» и «записали rating» админ успевает перевести объект на ручной рейтинг,
 * и среднее по отзывам затирает manualRating.
 *
 * Почему сырая команда, а не updateMany: коннектор MongoDB у Prisma дописывает к любому
 * условию по полю проверку существования поля ($ne: ["$rating_source", "$$REMOVE"]), а у всех
 * существующих документов поля rating_source физически нет — оно появилось в схеме только сейчас
 * и подставляется дефолтом лишь при чтении. Фильтр Prisma «ratingSource не manual» не совпал бы
 * ни с одним из них, и рейтинг перестал бы пересчитываться. Нативный $ne такие документы видит.
 * Отсюда же нативные имена полей: rating_source, reviews_count.
 */
export const updateEntityRating = async (entityType, entityId) => {
  const collection = collectionByEntityType[entityType]
  if (!collection) return

  const reviews = await prisma.review.findMany({
    where: { entityType, entityId, status: "approved" },
    select: { rating: true },
  })

  const count = reviews.length
  const avgRating = count > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0
  const rating = Math.round(avgRating * 10) / 10
  const id = { $oid: entityId }

  // Объект удалён — оба фильтра просто ни с чем не совпадут, команда вернёт n: 0 и не бросит
  await prisma.$runCommandRaw({
    update: collection,
    updates: [
      { q: { _id: id }, u: { $set: { reviews_count: count } } },
      { q: { _id: id, rating_source: { $ne: "manual" } }, u: { $set: { rating } } },
    ],
    ordered: false,
  })
}

/**
 * Одобренные отзывы объекта в порядке от новых к старым.
 *
 * Выборка по той же полиморфной паре entityType/entityId, по которой считает updateEntityRating,
 * а не по связи Prisma: внешние ключи place_id/route_id/service_id заполнены не у всех отзывов
 * (у отзывов на места — ни у одного), и include: { reviews } отдавал пустой список там,
 * где рейтинг посчитан по существующим отзывам. Источник истины должен быть один.
 */
export const findApprovedReviews = (entityType, entityId) =>
  prisma.review.findMany({
    where: { entityType, entityId, status: "approved" },
    orderBy: { createdAt: "desc" },
  })

/**
 * Поля рейтинга для админского сохранения.
 * Возвращает кусок data, признак пересчёта по отзывам и текст ошибки валидации.
 */
export const buildRatingUpdate = (body, existing = {}) => {
  const { ratingSource, manualRating } = body || {}
  if (ratingSource === undefined && manualRating === undefined) {
    return { data: {}, recalcFromReviews: false, error: null }
  }

  const rawSource = ratingSource !== undefined ? ratingSource : existing.ratingSource
  const source = rawSource === "manual" ? "manual" : "reviews"

  const rawManual = manualRating !== undefined ? manualRating : existing.manualRating
  let manual = null
  if (rawManual !== null && rawManual !== undefined && rawManual !== "") {
    manual = Number(rawManual)
    if (Number.isNaN(manual) || manual < 0 || manual > 5) {
      return { data: {}, recalcFromReviews: false, error: "Рейтинг должен быть числом от 0 до 5" }
    }
  }

  const data = { ratingSource: source, manualRating: manual }
  if (source === "manual") data.rating = manual ?? 0

  return { data, recalcFromReviews: source === "reviews", error: null }
}
