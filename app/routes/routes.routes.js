import express from "express"
import {
  getRouteFiltersPublic,
  getRoutesPublic,
  getRouteByIdOrSlugPublic,
  createRouteReview,
} from "./routes.public.controller.js"
import { visitor } from "../middleware/visitor.middleware.js"

const router = express.Router()

router.get("/filters", getRouteFiltersPublic)
router.get("/", getRoutesPublic)
router.post("/:routeId/reviews", createRouteReview)
router.get("/:idOrSlug", visitor, getRouteByIdOrSlugPublic)

export default router
