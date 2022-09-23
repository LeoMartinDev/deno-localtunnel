export async function promiseRetry<T>(
  fn: () => Promise<T>,
  retriesLeft = 5,
  interval = 1000
): Promise<T> | never {
  try {
    return await fn();
  } catch (error) {
    if (retriesLeft === 1) {
      throw error;
    } else {
      await new Promise((resolve) => setTimeout(resolve, interval));
      return promiseRetry(fn, retriesLeft - 1, interval);
    }
  }
}
