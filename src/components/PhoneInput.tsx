"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function formatRu(raw: string) {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.startsWith("7")) digits = digits.slice(1);
  digits = digits.slice(0, 10);

  if (digits.length === 0) return "";

  const parts: string[] = ["+7"];
  if (digits.length > 0) parts.push(" (" + digits.slice(0, 3));
  if (digits.length >= 3) parts[parts.length - 1] += ")";
  if (digits.length > 3) parts.push(" " + digits.slice(3, 6));
  if (digits.length > 6) parts.push("-" + digits.slice(6, 8));
  if (digits.length > 8) parts.push("-" + digits.slice(8, 10));
  return parts.join("");
}

export function PhoneInput({
  id,
  name = "phone",
  defaultValue = "",
  required = false,
  className,
}: {
  id: string;
  name?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(formatRu(defaultValue));

  return (
    <Input
      id={id}
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="+7 (___) ___-__-__"
      required={required}
      value={value}
      onChange={(e) => setValue(formatRu(e.target.value))}
      className={cn("h-11 text-base", className)}
    />
  );
}
