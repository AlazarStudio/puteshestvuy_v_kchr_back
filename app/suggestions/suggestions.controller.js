import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

// @desc    Submit a place suggestion
// @route   POST /api/suggestions/places
// @access  Auth (user)
export const createSuggestion = asyncHandler(async (req, res) => {
  const {
    title, location, latitude, longitude,
    shortDescription, description, howToGet, importantInfo,
    mapUrl, audioGuide, video, image, sliderVideo,
    images, directions, seasons, objectTypes, accessibility,
  } = req.body

  if (!title) {
    res.status(400)
    throw new Error('Название обязательно')
  }

  const suggestion = await prisma.placeSuggestion.create({
    data: {
      submittedById: req.user.id,
      submitterName: req.user.name || null,
      submitterEmail: req.user.email || null,
      title,
      location: location || null,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      shortDescription: shortDescription || null,
      description: description || null,
      howToGet: howToGet || null,
      importantInfo: importantInfo || null,
      mapUrl: mapUrl || null,
      audioGuide: audioGuide || null,
      video: video || null,
      image: image || null,
      sliderVideo: sliderVideo || null,
      images: Array.isArray(images) ? images : [],
      directions: Array.isArray(directions) ? directions : [],
      seasons: Array.isArray(seasons) ? seasons : [],
      objectTypes: Array.isArray(objectTypes) ? objectTypes : [],
      accessibility: Array.isArray(accessibility) ? accessibility : [],
    },
  })

  res.status(201).json(suggestion)
})

// @desc    Get current user's suggestions
// @route   GET /api/suggestions/places/my
// @access  Auth (user)
export const getMySuggestions = asyncHandler(async (req, res) => {
  const suggestions = await prisma.placeSuggestion.findMany({
    where: { submittedById: req.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      title: true,
      location: true,
      status: true,
      adminComment: true,
      approvedPlaceId: true,
    },
  })
  res.json(suggestions)
})
