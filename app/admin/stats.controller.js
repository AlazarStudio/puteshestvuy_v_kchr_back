import asyncHandler from "express-async-handler"
import { prisma } from "../prisma.js"

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Admin
export const getDashboardStats = asyncHandler(async (req, res) => {
  const [routes, places, news, services, reviews] = await Promise.all([
    prisma.route.count(),
    prisma.place.count(),
    prisma.news.count(),
    prisma.service.count(),
    prisma.review.count(),
  ])

  res.json({
    routes,
    places,
    news,
    services,
    reviews,
  })
})
