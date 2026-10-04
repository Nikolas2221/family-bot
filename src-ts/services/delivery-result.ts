export type DeliveryResult = 'delivered' | 'failed' | 'sending';
export async function deliverOnce(send: (() => Promise<unknown>) | undefined): Promise<DeliveryResult> {
  if (!send) return 'failed';
  try { await send(); return 'delivered'; } catch (error) {
    // Only a definitive rejection proves that Discord did not create the message.
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
    return status >= 400 && status < 500 && status !== 408 && status !== 429 ? 'failed' : 'sending';
  }
}
