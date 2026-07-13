import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Есть ли в URL параметр rtext (точки маршрута). */
function hasRoutePoints(url) {
  return /[?&]rtext=/.test(url)
}

/** http(s)-ссылка на домен yandex.* — только такие разворачиваем через curl. */
function isYandexHttpUrl(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return /(^|\.)yandex\.[a-z]+$/i.test(u.hostname)
  } catch {
    return false
  }
}

/**
 * Разворачивает короткую ссылку Яндекс.Карт (web-maps/-/CODE) в полный URL с
 * rtext/rtt через системный curl (Node/axios Яндекс режет капчей). Best-effort:
 * при ошибке/отсутствии curl возвращает исходный URL. Ходит только по http(s) на
 * yandex.* — чтобы admin-ввод не превратился в SSRF.
 */
export async function resolveYandexMapUrl(url) {
  if (!isYandexHttpUrl(url)) return url
  const devnull = process.platform === 'win32' ? 'NUL' : '/dev/null'
  const args = [
    '-sIL', '-A', CHROME_UA,
    '--max-redirs', '5', '--max-time', '8',
    '--proto', '=http,https', '--proto-redir', '=http,https',
    '-o', devnull, '-w', '%{url_effective}',
    '--', url,
  ]
  try {
    const { stdout } = await execFileAsync('curl', args, { timeout: 10000, maxBuffer: 1_000_000 })
    const final = String(stdout || '').trim()
    return final || url
  } catch (err) {
    const out = String(err?.stdout || '').trim()
    return out && hasRoutePoints(out) ? out : url
  }
}

/**
 * Нормализует mapUrl перед сохранением: пусто → null; уже содержит rtext → как есть
 * (trim); иначе разворачиваем. Если развёрнутый всё равно без rtext — сохраняем
 * исходную ссылку (кнопка в браузере откроет её корректно).
 */
export async function normalizeYandexMapUrl(raw) {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  if (hasRoutePoints(trimmed)) return trimmed
  const resolved = await resolveYandexMapUrl(trimmed)
  return hasRoutePoints(resolved) ? resolved : trimmed
}
