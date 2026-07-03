interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 40, className = '' }: LogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Logo"
      width={size}
      height={size}
      className={`rounded-full object-contain ${className}`}
      draggable={false}
    />
  );
}
