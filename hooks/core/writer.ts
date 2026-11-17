type Persist<T> = (key: string, value: T) => Promise<unknown>

type Queue<T> = { next: T | null; persist: Persist<T>; idle: Promise<void> }

export type Writer<T> = (key: string, value: T, persist: Persist<T>) => Promise<void>

export const createWriter = <T extends {}>(): Writer<T> => {
  const queues = new Map<string, Queue<T>>()

  return (key, value, persist) => {
    const queued = queues.get(key)
    if (queued) {
      queued.next = value
      queued.persist = persist

      return queued.idle
    }

    const queue: Queue<T> = { next: value, persist, idle: Promise.resolve() }
    queues.set(key, queue)
    queue.idle = (async () => {
      for (let snapshot = queue.next; snapshot !== null; snapshot = queue.next) {
        queue.next = null
        try {
          await queue.persist(key, snapshot)
        } catch {}
      }
      queues.delete(key)
    })()

    return queue.idle
  }
}
