/**
 * 定时任务调度器。
 *
 * 应用跑在 vinext 上，没有 scheduled 入口，所以用这个独立 Worker 触发
 * /api/cron/*（那些路由已经用 CRON_SECRET 校验调用方，应用侧不用改）。
 *
 * 两条任务：maintenance（推进卡住的生成任务，重活由应用 Worker 里的
 * Cloudflare Images 完成）、blocklist-sync（同步一次性邮箱黑名单）。
 */
const TASKS = ["/api/cron/maintenance", "/api/cron/blocklist-sync"];

export default {
  async scheduled(event, env, ctx) {
    const isDailyMaintenance = event.cron === "0 3 * * *";
    const path = isDailyMaintenance ? TASKS[0] : TASKS[1];
    ctx.waitUntil(
      (async () => {
        const response = await fetch(`${env.APP_URL}${path}`, {
          method: "GET",
          headers: { authorization: `Bearer ${env.CRON_SECRET}` },
        });
        const body = await response.text();
        console.log("cron dispatched", {
          cron: event.cron,
          path,
          status: response.status,
          body: body.slice(0, 500),
        });
        if (!response.ok) {
          throw new Error(`Cron task ${path} failed with ${response.status}`);
        }
      })(),
    );
  },
};
