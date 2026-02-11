import express from "express"
import {
  getServicesPublic,
  getServiceByIdOrSlugPublic,
  createServiceReview,
} from "./services.public.controller.js"
import { visitor } from "../middleware/visitor.middleware.js"

const router = express.Router()

router.get("/", getServicesPublic)
router.get("/:idOrSlug", visitor, getServiceByIdOrSlugPublic)
router.post("/:serviceId/reviews", createServiceReview)

export default router
