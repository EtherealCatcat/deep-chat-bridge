import { useEffect, useState } from "react";

const cache = new Map<string, string>();

function isNearWhite(data: Uint8ClampedArray, index: number): boolean {
  return data[index] > 242 && data[index + 1] > 242 && data[index + 2] > 242;
}

async function removeWhiteBackground(src: string): Promise<string> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });

  const scale = Math.min(1, 520 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return src;
  context.drawImage(image, 0, 0, width, height);
  const frame = context.getImageData(0, 0, width, height);
  const data = frame.data;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];

  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (seen[pixel]) return;
    seen[pixel] = 1;
    const index = pixel * 4;
    if (!isNearWhite(data, index)) return;
    data[index + 3] = 0;
    stack.push(pixel);
  };

  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    visit(0, y);
    visit(width - 1, y);
  }

  while (stack.length) {
    const pixel = stack.pop()!;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }

  context.putImageData(frame, 0, 0);
  return canvas.toDataURL("image/png");
}

export function StickerImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [resolved, setResolved] = useState(() => cache.get(src) ?? src);

  useEffect(() => {
    const cached = cache.get(src);
    if (cached) {
      setResolved(cached);
      return;
    }
    let cancelled = false;
    setResolved(src);
    void removeWhiteBackground(src)
      .then((url) => {
        cache.set(src, url);
        if (!cancelled) setResolved(url);
      })
      .catch(() => {
        // 跨域或格式不支持时退回原图
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return <img src={resolved} alt={alt} className={`sticker-art ${className}`} draggable={false} />;
}
