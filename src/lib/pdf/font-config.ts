import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

export function ensureFontsRegistered() {
  if (registered) return;
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(fontsDir, "Inter-Regular.ttf") },
      { src: path.join(fontsDir, "Inter-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Отключить hyphenation для русского — react-pdf по умолчанию делает дефисы по-английски
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
