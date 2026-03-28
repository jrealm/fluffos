export class CallOutManager {
  constructor() {
    this.queue = [];
    this.onFire = null;
    this.maxCallOuts = 1000;
    this.activeCount = 0;
  }

  add(func, object, delaySec, args) {
    if (this.activeCount >= this.maxCallOuts) {
      throw new Error(`Too many call_outs (max ${this.maxCallOuts})`);
    }
    const entry = {
      func, object, args,
      expireAt: Date.now() + delaySec * 1000,
      cancelled: false,
    };
    this._heapPush(entry);
    this.activeCount++;
    return entry;
  }

  remove(entry) {
    if (!entry.cancelled) {
      entry.cancelled = true;
      this.activeCount--;
    }
  }

  getAll() {
    return this.queue;
  }

  findCallOut(object, func) {
    for (const entry of this.queue) {
      if (!entry.cancelled && entry.object === object && entry.func === func) {
        return entry;
      }
    }
    return null;
  }

  tick() {
    const now = Date.now();
    while (this.queue.length > 0 && this.queue[0].expireAt <= now) {
      const entry = this._heapPop();
      if (!entry.cancelled) {
        this.activeCount--;
        if (this.onFire) {
          this.onFire(entry.func, entry.object, entry.args);
        }
      }
    }
  }

  _heapPush(entry) {
    this.queue.push(entry);
    this._bubbleUp(this.queue.length - 1);
  }

  _heapPop() {
    const top = this.queue[0];
    const last = this.queue.pop();
    if (this.queue.length > 0) {
      this.queue[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.queue[i].expireAt < this.queue[parent].expireAt) {
        [this.queue[i], this.queue[parent]] = [this.queue[parent], this.queue[i]];
        i = parent;
      } else break;
    }
  }

  _sinkDown(i) {
    const n = this.queue.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.queue[left].expireAt < this.queue[smallest].expireAt) smallest = left;
      if (right < n && this.queue[right].expireAt < this.queue[smallest].expireAt) smallest = right;
      if (smallest !== i) {
        [this.queue[i], this.queue[smallest]] = [this.queue[smallest], this.queue[i]];
        i = smallest;
      } else break;
    }
  }
}
