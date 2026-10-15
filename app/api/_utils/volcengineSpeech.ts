/** Decode HTTP Chunked JSON, preserving audio byte order across network chunks. */
export async function readVolcengineAudio(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error('语音接口未返回有效音频');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const audio: Buffer[] = [];
  let pending = '';
  let totalBytes = 0;
  let complete = false;
  const consume = (line: string) => {
    const content = line.trim().replace(/^data:\s*/, '');
    if (!content) return;
    const item = JSON.parse(content);
    const code = item.code ?? 0;
    if (code !== 0 && code !== 20000000) throw new Error(`火山语音错误（${code}）：${typeof item.message === 'string' ? item.message : '合成失败'}`);
    if (typeof item.data === 'string' && item.data) {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.data)) throw new Error('语音接口返回无效音频数据');
      const chunk = Buffer.from(item.data, 'base64');
      totalBytes += chunk.length;
      if (totalBytes > 30 * 1024 * 1024) throw new Error('语音音频过大，请分段朗读');
      audio.push(chunk);
    }
    if (code === 20000000) complete = true;
  };
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline: number;
      while (!complete && (newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        consume(line);
      }
      if (pending.length > 8 * 1024 * 1024) throw new Error('语音接口响应过大');
      if (done) { if (!complete && pending.trim()) consume(pending); break; }
    }
    if (!complete) throw new Error('语音合成意外中断，请重试');
    if (!totalBytes) throw new Error('无有效音频数据');
    return Buffer.concat(audio);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
