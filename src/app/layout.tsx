import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WhatsApp Marketing & Web Tools (WAHA)',
  description: 'Web WhatsApp Clone & Marketing Tools powered by WAHA (WhatsApp HTTP API)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="h-screen w-screen overflow-hidden select-none bg-[#EFEAE2]">
        {children}
      </body>
    </html>
  );
}
