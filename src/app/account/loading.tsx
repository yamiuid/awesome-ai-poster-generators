import { SiteHeader } from "@/components/site-header";

/**
 * /account 加载骨架屏：镜像 account/page.tsx 的布局结构，
 * 在 SSR（getAuthContext + generations + signed URLs）完成前展示。
 * 服务端组件，纯标记 + CSS，不引客户端组件。
 */
export default function AccountLoading() {
  return (
    <main className="account-page">
      <SiteHeader />
      <section className="account-heading">
        <div>
          <p className="eyebrow">Private history</p>
          <div className="skeleton-title" />
        </div>
        <div className="skeleton-sub" />
      </section>
      <div className="history-grid" aria-hidden="true">
        {["skeleton-1", "skeleton-2", "skeleton-3", "skeleton-4"].map((key) => (
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
