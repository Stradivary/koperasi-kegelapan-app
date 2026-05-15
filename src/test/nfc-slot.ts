const state: { card: Uint8Array | null; serial: string } = {
  card: null,
  serial: "aa:bb:cc:dd:ee:ff",
};

export const nfcSlot = {
  /** Insert a card into the reader slot */
  insert(bytes: Uint8Array, serial = "aa:bb:cc:dd:ee:ff"): void {
    state.card = new Uint8Array(bytes);
    state.serial = serial;
  },

  /** Remove the card from the slot */
  eject(): void {
    state.card = null;
  },

  /** Read current slot bytes (returns a copy) */
  peek(): Uint8Array | null {
    return state.card ? new Uint8Array(state.card) : null;
  },

  getSerial(): string {
    return state.serial;
  },

  /** Update slot bytes to simulate a successful write */
  commit(bytes: Uint8Array): void {
    state.card = new Uint8Array(bytes);
  },
};
