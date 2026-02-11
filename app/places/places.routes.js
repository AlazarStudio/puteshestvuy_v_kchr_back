import express from "express"
import {
  getPlaceFiltersPublic,
  getPlacesPublic,
  getPlaceByIdOrSlugPublic,
  createPlaceReview,
} from "./places.public.controller.js"
import { visitor } from "../middleware/visitor.middleware.js"

const router = express.Router()

router.get("/", getPlacesPublic)
router.get("/filters", getPlaceFiltersPublic)
router.post("/:placeId/reviews", createPlaceReview)
router.get("/:idOrSlug", visitor, getPlaceByIdOrSlugPublic)

export default router
