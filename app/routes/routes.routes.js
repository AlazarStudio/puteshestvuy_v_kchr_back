import express from "express"
import {
  getRouteFiltersPublic,
  getRoutesPublic,
  getRouteByIdOrSlugPublic,
} from "./routes.public.controller.js"

const router = express.Router()

router.get("/filters", getRouteFiltersPublic)
router.get("/", getRoutesPublic)
router.get("/:idOrSlug", getRouteByIdOrSlugPublic)

export default router
