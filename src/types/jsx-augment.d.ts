// Augment React's ImgHTMLAttributes to include the fetchpriority attribute
import "react";

declare module "react" {
  interface ImgHTMLAttributes<T> {
    fetchpriority?: "auto" | "high" | "low" | string;
  }
}
