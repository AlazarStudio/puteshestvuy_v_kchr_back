import express from "express"
import {
  getServicesPublic,
  getServiceByIdOrSlugPublic,
  createServiceReview,
} from "./services.public.controller.js"

const router = express.Router()

router.get("/", getServicesPublic)
router.get("/:idOrSlug", getServiceByIdOrSlugPublic)
router.post("/:serviceId/reviews", createServiceReview)

export default router
