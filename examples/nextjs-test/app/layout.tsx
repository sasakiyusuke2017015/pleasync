import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'pleasync-client integration test',
  description: 'Verify @pleasync/client works under Next.js App Router',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
