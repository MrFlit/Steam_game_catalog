import "./globals.css";
import PwaInstallPrompt from "../components/PwaInstallPrompt";

export const metadata = {
  title: "Game Catalog",
  description: "Steam game catalog",
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  themeColor: "#060b11",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}) {
  return (
    <html lang="ru">
      <body>
        {children}
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
