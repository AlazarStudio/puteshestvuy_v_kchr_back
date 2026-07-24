/** MongoDB ObjectId в hex-виде (24 символа) */
export const isObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""))

/** Максимальная длина подписи фотографии (автор, место) */
export const CAPTION_MAX_LENGTH = 200

/** Нормализация подписи: обрезка пробелов и длины */
export const trimCaption = (value) => String(value || "").trim().slice(0, CAPTION_MAX_LENGTH)
