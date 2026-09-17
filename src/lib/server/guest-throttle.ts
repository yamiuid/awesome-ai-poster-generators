import { clientIpFromRequest, createRateLimiter } from "./rate-limit";

/**
 * 访客生图/上传的 IP 维度兜底限流。
 *
 * 身份 cookie 一旦被清掉（脚本调用、无痕窗口）访客就变成「新用户」，免费额度随之重置，
 * 而每次生成都是真金白银的 provider 调用、每次上传都写对象存储。
 * 这里按 IP 再兜一层：内存计数、按实例生效（和现有上传限流同一套实现），
 * 阈值刻意放宽到正常用户碰不到的量级，只拦自动化滥用。
 */
const GUEST_WINDOW_MS = 60 * 60 * 1_000;

const guestGenerationLimiter = createRateLimiter({
  windowMs: GUEST_WINDOW_MS,
  max: 30,
});
const guestUploadLimiter = createRateLimiter({
  windowMs: GUEST_WINDOW_MS,
  max: 60,
});

export function isGuestGenerationRateLimited(request: Request): boolean {
  return !guestGenerationLimiter.check(clientIpFromRequest(request)).ok;
}

export function isGuestUploadRateLimited(request: Request): boolean {
  return !guestUploadLimiter.check(clientIpFromRequest(request)).ok;
}
