import rateLimit from 'express-rate-limit'
import { RATE_LIMITS } from '#config'

export const authRequestLimiter = rateLimit({
  windowMs: RATE_LIMITS.authRequest.windowMs,
  max: RATE_LIMITS.authRequest.max,
  keyGenerator: (req) => req.body?.email || req.ip || 'unknown',
  message: { error: 'Too many OTP requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const authVerifyLimiter = rateLimit({
  windowMs: RATE_LIMITS.authVerify.windowMs,
  max: RATE_LIMITS.authVerify.max,
  message: { error: 'Too many verification attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const analyzeLimiter = rateLimit({
  windowMs: RATE_LIMITS.analyze.windowMs,
  max: RATE_LIMITS.analyze.max,
  keyGenerator: (req: any) => req.user?.email || req.ip || 'unknown',
  message: { error: 'Upload limit reached. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const globalLimiter = rateLimit({
  windowMs: RATE_LIMITS.global.windowMs,
  max: RATE_LIMITS.global.max,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})
