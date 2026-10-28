import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import AnnouncementPopup from '@/components/AnnouncementPopup';

export const metadata: Metadata = {
  title: 'CloudBusLink - 校巴點名系統',
  description: '校巴點名打卡系統',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#3b82f6',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-HK" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        {children}
        <AnnouncementPopup />
      </body>
    </html>
  );
}
