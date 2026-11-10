import {
  Keyboard,
  Headphones,
  Monitor,
  HardDrive,
  Wifi,
  Gamepad2,
  AppWindow,
  Package,
} from "lucide-react";
export function CategoryIcon({
  name,
  size = 24,
}: {
  name: string;
  size?: number;
}) {
  const Icon =
    (
      {
        Keyboard,
        Headphones,
        Monitor,
        HardDrive,
        Wifi,
        Gamepad2,
        AppWindow,
      } as Record<string, typeof Package>
    )[name] || Package;
  return <Icon size={size} strokeWidth={1.7} />;
}
