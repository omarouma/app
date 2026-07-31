interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 40, className = '' }: LogoProps) {
  return (
    <img
      src="/logo.png"
      alt="GaGa Chat - Free Global Messaging & Video Call App"
      width={size}
      height={size}
      className={`rounded-full object-contain ${className}`}
      draggable={false}
      loading="eager"
    />
  );
}
