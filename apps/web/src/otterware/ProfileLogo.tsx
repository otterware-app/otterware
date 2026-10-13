import type { ComponentProps } from "react";
import { activeProfile } from "@otterware/profiles/active";
import { OtterwareLogo } from "./OtterwareLogo";

/** Uses the same profile artwork served by the web build and packaged desktop. */
export function ProfileLogo({ className }: { className?: string }) {
  if (activeProfile.id === "otterware") return <OtterwareLogo className={className} />;
  return <img src="/favicon.svg" alt="" aria-hidden="true" className={className} />;
}

export function ProfileWordmark({ className, ...props }: ComponentProps<"span">) {
  return (
    <span className={className} {...props}>
      <ProfileLogo className="size-8 shrink-0" />
      <span>{activeProfile.brand.productName}</span>
    </span>
  );
}
