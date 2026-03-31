import express from "express"
import { createBookingRequest, getBusyBookingDates } from "./bookings.public.controller.js"
import { validateRequest } from "../middleware/validation.middleware.js"

const router = express.Router()

router.get("/busy-dates", getBusyBookingDates)

router.post(
  "/",
  validateRequest([
    { field: "bookingDate", required: true },
    { field: "direction", required: true, minLength: 2, maxLength: 64 },
    { field: "contactName", required: true, minLength: 2, maxLength: 80 },
    { field: "contactPhone", required: true, minLength: 5, maxLength: 40 },
    { field: "contactEmail", required: true, isEmail: true, maxLength: 120 },
  ]),
  createBookingRequest
)

export default router

