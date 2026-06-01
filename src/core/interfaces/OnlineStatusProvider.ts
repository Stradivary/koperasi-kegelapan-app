export interface OnlineStatusProvider {
  /**
   * Returns true if the device currently has network connectivity.
   */
  isOnline(): boolean;
}
