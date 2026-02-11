import dotenv from "dotenv"
import express from "express"
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
import newsPublicRoutes from "./app/news/news.routes.js"
import regionPublicRoutes from "./app/region/region.routes.js"
import footerPublicRoutes from "./app/footer/footer.routes.js"
import homePublicRoutes from "./app/home/home.routes.js"

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
  app.use("/api/news", newsPublicRoutes)
  app.use("/api/region", regionPublicRoutes)
  app.use("/api/footer", footerPublicRoutes)
  app.use("/api/home", homePublicRoutes)

  app.use(notFound)
  app.use(errorHandler)

  const PORT = isProd ? 443 : 5000 

  let server

  if (isProd) {
    // SSL only in prod
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
    // dev, etc → HTTP
    server = app.listen(PORT, () => {
      console.log(`HTTP Server running in ${process.env.NODE_ENV} on port ${PORT}`)
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
