/** Export the chart together with the context needed to read it outside the app. */
export async function downloadChart(imageUrl: string, title: string, lines: string[]) {
  const image = new Image();
  image.src = imageUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(image.width, 1000);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法生成下载图片');
  const wrapped: string[] = [];
  context.font = '24px sans-serif';
  for (const line of [title, ...lines]) {
    let part = '';
    for (const char of line) {
      if (context.measureText(part + char).width > canvas.width - 64) { wrapped.push(part); part = ''; }
      part += char;
    }
    wrapped.push(part);
  }
  const header = 32 + wrapped.length * 36;
  canvas.height = header + image.height + 24;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#172033'; context.font = '24px sans-serif';
  wrapped.forEach((line, index) => context.fillText(line, 32, 36 + index * 36));
  context.drawImage(image, (canvas.width - image.width) / 2, header);
  const link = document.createElement('a');
  link.download = title + '.png'; link.href = canvas.toDataURL('image/png'); link.click();
}
