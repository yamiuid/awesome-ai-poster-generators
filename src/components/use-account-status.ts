"use client";

import ky from "ky";
import { useEffect, useState } from "react";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/server/supabase/browser";
import { SUBSCRIPTION_LIFECYCLE_STATES } from "@/lib/server/waffo-subscription";

const accountStatusSchema = z.object({
  signedIn: z.boolean(),
  isPro: z.boolean().optional(),
  hasPack: z.boolean().optional(),
  subscriptionState: z.enum(SUBSCRIPTION_LIFECYCLE_STATES).optional(),
  balance: z
    .object({
      available: z.number(),
      bucket: z.string(),
      grants: z.array(
        z.object({
          source: z.string(),
          amount: z.number(),
          createdAt: z.string(),
        }),
      ),
    })
    .nullable()
    .optional(),
});

export type AccountStatus = z.infer<typeof accountStatusSchema>;

/**
 * 浏览器端解析登录态。
 *
 * 首页、风格落地页、定价页现在都是静态预渲染（服务端不再读登录态），
 * 所以登录态统一在挂载后向 /api/account/status 取一次，并在
 * 登录/登出时（同页邮箱验证码、Google 回跳、用户菜单登出）重新校准。
 *
 * 这不是权限判断：生成、扣费、访客限额都由服务端接口按 cookie 裁决，
 * 这里只决定界面显示哪一档。
 */
export function useAccountStatus(): AccountStatus | null {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  useEffect(() => {
    let active = true;
    async function sync(): Promise<void> {
      try {
        const raw = await ky
          .get("/api/account/status", { timeout: 15_000 })
          .json<unknown>();
        const parsed = accountStatusSchema.parse(raw);
        if (active) {
          setStatus(parsed);
        }
      } catch {
        // 取不到就维持上一状态（首次为 null，调用方按访客渲染）
      }
    }
    void sync();
    const { data: listener } =
      createSupabaseBrowserClient().auth.onAuthStateChange((event) => {
        if (
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT" ||
          event === "USER_UPDATED"
        ) {
          void sync();
        }
      });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  return status;
}
