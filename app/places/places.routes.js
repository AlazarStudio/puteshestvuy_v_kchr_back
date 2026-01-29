import express from "express"
import { getPlacesPublic, getPlaceByIdOrSlugPublic, createPlaceReview } from "./places.public.controller.js"

const router = express.Router()

router.get("/", getPlacesPublic)
router.post("/:placeId/reviews", createPlaceReview)
router.get("/:idOrSlug", getPlaceByIdOrSlugPublic)

export default router
