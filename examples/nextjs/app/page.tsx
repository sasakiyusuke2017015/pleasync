export default function Home() {
  return (
    <main>
      <h1>pleasync-test</h1>
      <p>
        外部プロジェクトから <code>@pleasync/client@beta</code> を npm 経由で
        install して実際に呼び出すテスト。
      </p>
      <h2>API endpoints</h2>
      <ul>
        <li>
          <a href="/api/info">/api/info</a> — バインディング情報
        </li>
        <li>
          <a href="/api/normalize">/api/normalize</a> — Rust 製 <code>normalize()</code> を実行（純関数、Pleasanter 不要）
        </li>
        <li>
          <a href="/api/site">/api/site</a> — 実 Pleasanter API 呼び出し（要 .env.local）
        </li>
      </ul>
    </main>
  );
}
