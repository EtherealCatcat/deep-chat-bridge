export interface PreparedImage {
  dataUrl: string;
  name: string;
  width: number;
  height: number;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("只能发图片。");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("这张图太大了，换一张小一点的。");
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("这张图处理不了。");
    ctx.fillStyle = "#fffaf3";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.84),
      name: file.name,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
