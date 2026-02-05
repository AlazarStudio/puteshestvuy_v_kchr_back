import asyncHandler from 'express-async-handler'
import { prisma } from '../prisma.js'

const EMPTY_CONTENT = {
  left: { logo: '', social: [], phone: '', address: '' },
  center: { title: '', links: [] },
  right: { title: '', formPlaceholderName: '', formPlaceholderEmail: '', formPlaceholderText: '', formButtonText: '', formRecipientEmail: '' },
  bottom: { orgName: '', links: [], partners: [] },
}

// @desc    Get footer content (admin)
// @route   GET /api/admin/footer
export const getFooter = asyncHandler(async (req, res) => {
  const footer = await prisma.footer.findUnique({
    where: { id: 'default' },
  })
  const content = footer?.content && typeof footer.content === 'object'
    ? footer.content
    : EMPTY_CONTENT
  res.json({ content })
})

// @desc    Update footer content
// @route   PUT /api/admin/footer
export const updateFooter = asyncHandler(async (req, res) => {
  const { content } = req.body
  const updated = await prisma.footer.upsert({
    where: { id: 'default' },
    update: { content: content || {} },
    create: { id: 'default', content: content || {} },
  })
  res.json({ content: updated.content })
})
