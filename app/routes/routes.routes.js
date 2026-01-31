import express from "express"
import {
  getRouteFiltersPublic,
  getRoutesPublic,
  getRouteByIdOrSlugPublic,
  createRouteReview,
} from "./routes.public.controller.js"

const router = express.Router()

router.get("/filters", getRouteFiltersPublic)
router.get("/", getRoutesPublic)
router.post("/:routeId/reviews", createRouteReview)
router.get("/:idOrSlug", getRouteByIdOrSlugPublic)

export default router
