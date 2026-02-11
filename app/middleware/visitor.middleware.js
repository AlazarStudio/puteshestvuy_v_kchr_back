import { randomUUID } from "crypto"
import jwt from "jsonwebtoken"
import { prisma } from "../prisma.js"
import { UserFields } from "../utils/user.utils.js"

const VISITOR_COOKIE_NAME = "visitorId"
const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000 // 1 год

/**
 * Middleware для идентификации уникальных пользователей
 * Для авторизованных пользователей использует userId из JWT токена
 * Для неавторизованных создает/использует UUID из cookie
 */
export const visitor = async (req, res, next) => {
  let visitorId = null
  let userId = null

  // Проверяем наличие JWT токена для авторизованных пользователей
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith("Bearer")) {
    try {
      const token = authHeader.split(" ")[1]
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      
      const userFound = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: UserFields,
      })

      if (userFound) {
        userId = userFound.id
        visitorId = userFound.id // Для авторизованных используем userId как visitorId
      }
    } catch (error) {
      // Если токен невалидный, игнорируем и продолжаем как неавторизованный пользователь
    }
  }

  // Если пользователь не авторизован, работаем с cookie
  if (!visitorId) {
    // Проверяем наличие cookie
    const cookieVisitorId = req.cookies?.[VISITOR_COOKIE_NAME]
    
    if (cookieVisitorId && typeof cookieVisitorId === "string" && cookieVisitorId.trim()) {
      visitorId = cookieVisitorId.trim()
    } else {
      // Создаем новый UUID для нового посетителя
      visitorId = randomUUID()
      // Устанавливаем cookie
      const cookieOptions = {
        maxAge: VISITOR_COOKIE_MAX_AGE,
        httpOnly: false, // false чтобы фронтенд мог читать cookie при необходимости
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
      }
      
      // В development добавляем domain если нужно
      if (process.env.NODE_ENV === 'development' && process.env.COOKIE_DOMAIN) {
        cookieOptions.domain = process.env.COOKIE_DOMAIN
      }
      
      res.cookie(VISITOR_COOKIE_NAME, visitorId, cookieOptions)
    }
  }

  // Добавляем идентификаторы в request
  req.visitorId = visitorId
  req.userId = userId // null для неавторизованных

  next()
}
