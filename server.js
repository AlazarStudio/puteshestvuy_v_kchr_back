import dotenv from "dotenv"
import express from "express"
import compression from "compression"
import morgan from "morgan"
import path from "path"
import cors from "cors"
import cookieParser from "cookie-parser"

import fs from "fs"
import https from "https"

import { errorHandler, notFound } from "./app/middleware/error.middleware.js"
import { prisma } from "./app/prisma.js"

import authRoutes from "./app/auth/auth.routes.js"
import userRoutes from "./app/user/user.routes.js"
import adminRoutes from "./app/admin/admin.routes.js"
import placesPublicRoutes from "./app/places/places.routes.js"
import routesPublicRoutes from "./app/routes/routes.routes.js"
import servicesPublicRoutes from "./app/services/services.routes.js"
import bookingsPublicRoutes from "./app/bookings/bookings.routes.js"
import newsPublicRoutes from "./app/news/news.routes.js"
import regionPublicRoutes from "./app/region/region.routes.js"
import footerPublicRoutes from "./app/footer/footer.routes.js"
import homePublicRoutes from "./app/home/home.routes.js"
import pagesPublicRoutes from "./app/pages/pages.routes.js"
import suggestionsRoutes from "./app/suggestions/suggestions.routes.js"

dotenv.config()

const app = express()

// Настройка CORS с поддержкой credentials
const corsOptions = {
  origin: function (origin, callback) {
    // В development разрешаем все origins, в production только из env
    if (process.env.NODE_ENV === 'development' || !process.env.FRONTEND_URL) {
      callback(null, true)
    } else {
      const allowedOrigins = process.env.FRONTEND_URL.split(',').map(url => url.trim())
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
}

app.use(cors(corsOptions))

const isDev = process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development"
const isProd = process.env.NODE_ENV === "production"

async function main() {
  if (isDev) app.use(morgan("dev"))

  // Сжатие ответов (gzip) — должно идти одним из первых, чтобы сжимать все ответы ниже
  app.use(compression())

  // Cookie parser должен быть ДО роутов, чтобы cookies были доступны в middleware
  app.use(cookieParser())
  app.use(express.json({ limit: "10mb" }))

  const __dirname = path.resolve()
  app.use("/uploads", express.static(path.join(__dirname, "/uploads/")))

  app.use("/api/auth", authRoutes)
  app.use("/api/users", userRoutes)
  app.use("/api/admin", adminRoutes)
  app.use("/api/places", placesPublicRoutes)
  app.use("/api/routes", routesPublicRoutes)
  app.use("/api/services", servicesPublicRoutes)
  app.use("/api/bookings", bookingsPublicRoutes)
  app.use("/api/news", newsPublicRoutes)
  app.use("/api/region", regionPublicRoutes)
  app.use("/api/footer", footerPublicRoutes)
  app.use("/api/home", homePublicRoutes)
  app.use("/api/pages", pagesPublicRoutes)
  app.use("/api/suggestions", suggestionsRoutes)

  app.use(notFound)
  app.use(errorHandler)

  // Когда перед приложением стоит TLS-терминирующий обратный прокси (Caddy/nginx),
  // Node слушает обычный HTTP на внутреннем порту, а прокси держит HTTPS/HTTP2/HTTP3.
  const behindProxy = process.env.BEHIND_PROXY === "true"
  if (behindProxy) app.set("trust proxy", true)

  const PORT = process.env.PORT ? Number(process.env.PORT) : (isProd ? 443 : 4000)

  let server

  if (isProd && !behindProxy) {
    // SSL terminates in Node (direct, без прокси)
    let sslOptions
    try {
      sslOptions = {
        key: fs.readFileSync(process.env.SERVER_KEY),
        cert: fs.readFileSync(process.env.SERVER_CERT),
        ca: fs.readFileSync(process.env.SERVER_CA),
      }
    } catch (err) {
      console.error("SSL files read error. Please check the paths in environment variables.")
      throw err
    }

    server = https.createServer(sslOptions, app).listen(PORT, () => {
      console.log(`HTTPS Server running in ${process.env.NODE_ENV} on port ${PORT}`)
    })
  } else {
    // dev, либо prod за обратным прокси → HTTP
    const HOST = process.env.HOST || (behindProxy ? "127.0.0.1" : "0.0.0.0")
    server = app.listen(PORT, HOST, () => {
      console.log(`HTTP Server running in ${process.env.NODE_ENV} on ${HOST}:${PORT}`)
    })
  }

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`${signal} signal received: closing server`)
    server.close(async () => {
      await prisma.$disconnect()
      console.log("Server closed")
      process.exit(0)
    })
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
