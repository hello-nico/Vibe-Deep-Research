import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import "./ui.css";

/** 按钮四种变体（docs/design.md §5）：主（墨色）、次（灰底胶囊）、文字、图标。一个区域最多一个主按钮。 */
export type ButtonVariant = "primary" | "secondary" | "text" | "icon";

export function buttonClass(variant: ButtonVariant = "secondary", small = false) {
  return cn("btn", variant === "primary" && "btn-primary", variant === "text" && "btn-text", variant === "icon" && "btn-icon", small && variant !== "icon" && "btn-sm");
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; small?: boolean }>(
  function Button({ variant = "secondary", small, className, type = "button", ...rest }, ref) {
    return <button ref={ref} type={type} className={cn(buttonClass(variant, small), className)} {...rest} />;
  },
);
