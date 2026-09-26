import { cn } from "@/lib/utils";

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconSize?: string;
}

/**
 * Gambar produk dengan object-fit: contain — foto SELALU tampil utuh,
 * tidak terpotong. Placeholder ikon jika tidak ada foto.
 */
export function ProductImage({ src, alt, className, iconSize = "text-4xl" }: ProductImageProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-lg border-2 border-ink bg-cream",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain p-1"
          loading="lazy"
        />
      ) : (
        <span className={cn("select-none opacity-40", iconSize)}>🍽️</span>
      )}
    </div>
  );
}
