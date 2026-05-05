import logo from "@/assets/longevity-ai-logo.png";

interface Props {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

export default function Logo({ size = 24, withWordmark = true, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={logo}
        alt="Longevity AI"
        width={size}
        height={size}
        className="object-contain drop-shadow-[0_0_10px_hsl(var(--primary)/0.35)]"
        style={{ width: size, height: size }}
      />
      {withWordmark && (
        <span className="text-base font-semibold tracking-tight text-foreground">
          Longevity <span className="text-primary">AI</span>
        </span>
      )}
    </span>
  );
}
