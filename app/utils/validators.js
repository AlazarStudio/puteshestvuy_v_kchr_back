/** MongoDB ObjectId в hex-виде (24 символа) */
export const isObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""))

/** Максимальная длина подписи фотографии (автор, место) */
export const CAPTION_MAX_LENGTH = 200

/** Нормализация подписи: обрезка пробелов и длины */
export const trimCaption = (value) => String(value || "").trim().slice(0, CAPTION_MAX_LENGTH)

/** Максимальный размер страницы в публичных списках */
export const MAX_PAGE_LIMIT = 500

/** Размер страницы: значение по умолчанию, нижняя граница и потолок */
export const parsePageLimit = (value, fallback) => {
  const requested = parseInt(value) || fallback
  if (requested < 1) return fallback
  return Math.min(requested, MAX_PAGE_LIMIT)
}

/**
 * Предупреждение, когда коллекция переросла потолок страницы: запрос «отдай всё»
 * с этого момента отдаёт не всё, и клиент не может отличить одно от другого
 */
export const warnIfListOutgrewLimit = (label, total, limit) => {
  if (limit >= MAX_PAGE_LIMIT && total > limit) {
    console.warn(`Список «${label}»: записей ${total} при потолке страницы ${MAX_PAGE_LIMIT} — полный список больше не помещается`)
  }
}
