import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'pleasync-test',
  description: 'External consumer test for @pleasync/client',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '32px auto', padding: 16 }}>
        {children}
      </body>
    </html>
  );
}
