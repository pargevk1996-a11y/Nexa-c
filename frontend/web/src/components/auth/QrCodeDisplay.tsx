interface QrCodeDisplayProps {
  value: string;
  size?: number;
  label?: string;
}

/** Renders a scannable QR via QR Server API (no extra npm dep). */
export function QrCodeDisplay({ value, size = 200, label }: QrCodeDisplayProps) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;

  return (
    <figure className="qr-code-display">
      <img src={src} width={size} height={size} alt={label ?? "QR code"} loading="lazy" />
      {label ? <figcaption className="qr-code-display__caption">{label}</figcaption> : null}
    </figure>
  );
}
