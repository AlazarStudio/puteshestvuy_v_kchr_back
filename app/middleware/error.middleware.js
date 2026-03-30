export const notFound = (req, res, next) => {
  const error = new Error(`Not found - ${req.originalUrl}`)
  res.status(404)
  next(error)
}

export const errorHandler = (err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    res.status(413)
    return res.json({
      message: "Файл слишком большой. Уменьшите размер или выберите другое изображение.",
      stack: process.env.NODE_ENV === "production" ? null : err.stack,
    })
  }

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode
  res.status(statusCode)
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  })
}
