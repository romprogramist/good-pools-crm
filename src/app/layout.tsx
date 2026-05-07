import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Хорошие Бассейны — CRM",
  description: "Система обслуживания бассейнов",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        {children}
      </body>
    </html>
  );
}
