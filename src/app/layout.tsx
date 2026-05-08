import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="ru" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="min-h-full flex flex-col bg-gradient-to-b from-teal-50/40 via-zinc-50 to-zinc-50 text-zinc-900">
        {children}
      </body>
    </html>
  );
}
