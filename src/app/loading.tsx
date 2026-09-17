import { SiteHeader } from "@/components/site-header";

/**
 * 路由级骨架屏。
 *
 * 导航点击后立刻切到这个占位，而不是在导航栏上转圈等人。
 * 页面都是动态渲染（每页都读登录态），没有占位时用户会看到"点了没反应"。
 * 账号页有更贴合的骨架（app/account/loading.tsx），会覆盖这一层。
 */
export default function RootLoading() {
  return (
    <main className="account-page">
      <SiteHeader />
      <section className="account-heading">
        <div>
          <div className="skeleton-title" />
        </div>
        <div className="skeleton-sub" />
      </section>
      <div className="history-grid" aria-hidden="true">
        {["block-1", "block-2"].map((key) => (
          <div className="history-card" key={key}>
            <div className="history-thumbs">
              <div className="pending-tile" />
            </div>
            <div className="skeleton-prompt" />
          </div>
        ))}
      </div>
    </main>
  );
}
