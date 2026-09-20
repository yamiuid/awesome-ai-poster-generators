import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/server/auth";
import { getAccountBalance } from "@/lib/server/credit-ledger";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export async function GET(): Promise<NextResponse> {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.json({
      signedIn: false,
      isPro: false,
      hasPack: false,
      subscriptionState: auth.subscriptionState,
    });
  }
  const { data: subscription } = await (await createSupabaseServerClient())
    .from("subscriptions")
    .select("plan, tier, status, period_end, cancel_at_period_end")
    .eq("user_id", auth.userId)
    .maybeSingle();

  // welcome 积分惰性领取：RPC 幂等（幂等键绑定 user_id），任意次数调用只发放一次。
  // 领取失败不阻断状态返回，只是前端暂时看不到余额。
  const admin = createSupabaseAdminClient();
  const { error: claimError } = await admin.rpc("claim_welcome_credits", {
    p_user_id: auth.userId,
  });
  if (claimError) {
    // 迁移未执行（RPC 不存在）或数据库故障时能看到原因
    console.error("claim_welcome_credits failed", {
      userId: auth.userId,
      message: claimError.message,
    });
  }
  const balance = claimError
    ? null
    : await getAccountBalance(admin, auth.userId);

  return NextResponse.json({
    signedIn: true,
    isPro: auth.isPro,
    // 静态页没有服务端注入，客户端要靠这两个字段决定界面档位
    hasPack: auth.hasPack,
    subscriptionState: auth.subscriptionState,
    subscription,
    balance,
  });
}
