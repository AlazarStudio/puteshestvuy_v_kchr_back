import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

const EMPTY_CONTENT = {
  left: { logo: '', social: [], phone: '', address: '' },
  center: { title: '', links: [] },
  right: { title: '', formPlaceholderName: '', formPlaceholderEmail: '', formPlaceholderText: '', formButtonText: '', formRecipientEmail: '' },
  bottom: { orgName: '', links: [], partners: [] },
}

// @desc    Get footer content (public)
// @route   GET /api/footer
export const getFooterPublic = asyncHandler(async (req, res) => {
  const footer = await prisma.footer.findUnique({
    where: { id: 'default' },
  })
  const content = footer?.content && typeof footer.content === 'object'
    ? footer.content
    : EMPTY_CONTENT
  res.json(content)
})
