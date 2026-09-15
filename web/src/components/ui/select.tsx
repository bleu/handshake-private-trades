import type { ComponentProps } from "react";
import { Icon } from "./icon";

export function Select({ children, ...props }: ComponentProps<"select">) {
  return (
    <span className="select-control">
      <select {...props}>{children}</select>
      <Icon name="chevron-down" />
    </span>
  );
}
